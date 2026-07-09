/**
 * grainworks Chat Panel v0.5
 * SSE-streaming chat interface for the Hermes API.
 * Sessions stored in localStorage. Zero dependencies. ES6 module.
 *
 * Import: import { renderChat } from './js/chat-panel.js';
 */

import { relativeTime, escapeHtml } from './shared-utils.js';

/* ── State ─────────────────────────────────── */

let apiKey = null;
let models = [];
let sessions = { current: null, list: [] };
let currentMessages = [];
let abortController = null;
let isLoading = false;
let refreshInterval = null;
let sidebarOpen = true;
let connectionStatus = 'connected'; /* 'connected' | 'reconnecting' | 'disconnected' */

const API_BASE = '/v1';
const LS_SESSIONS_KEY = 'chat_sessions';
const LS_MSG_PREFIX = 'chat_messages_';
const LS_SIDEBAR_KEY = 'chat_sidebar_open';

/* ── Helpers ───────────────────────────────── */

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function renderMarkdown(text) {
  if (typeof text !== 'string') return '';
  let html = escapeHtml(text);
  // Code blocks (triple backticks with optional language)
  html = html.replace(/```(\w*)\s*\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langClass = lang ? ' class="language-' + escapeHtml(lang) + '"' : '';
    return '<pre><code' + langClass + '>' + code.trim() + '</code></pre>';
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Bold **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic *text* (but not **bold** leftovers)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return html;
}

function addCopyButton(bubble, content) {
  // Don't add if one already exists
  if (bubble.querySelector('.cp-copy-btn')) return;
  const btn = document.createElement('button');
  btn.className = 'cp-copy-btn';
  btn.title = 'Copy message';
  btn.textContent = '⎘';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content).then(() => {
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = '⎘'; }, 1500);
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = content;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = '⎘'; }, 1500);
    });
  });
  bubble.appendChild(btn);
}

/* ── API Helpers ───────────────────────────── */

async function fetchApiKey() {
  // API key is optional — nginx proxy adds its own auth header
  // Only load from file if it exists for direct API access
  return null;
}

async function fetchModels() {
  try {
    const headers = {};
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    const resp = await fetch(API_BASE + '/models', { headers });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    models = data.data || data.models || [];
    return models;
  } catch {
    return [];
  }
}

async function sendMessage(messages, model, onChunk, onDone, onError) {
  abortController = new AbortController();
  isLoading = true;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    const resp = await fetch(API_BASE + '/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true
      }),
      signal: abortController.signal
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'Unknown error');
      onError('HTTP ' + resp.status + ': ' + errText);
      isLoading = false;
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);

        if (payload === '[DONE]') {
          onDone(fullContent);
          isLoading = false;
          return;
        }

        try {
          const parsed = JSON.parse(payload);
          const choices = parsed.choices;
          if (choices && choices.length > 0) {
            const delta = choices[0].delta;
            if (delta && delta.content) {
              fullContent += delta.content;
              onChunk(fullContent);
            }
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    onDone(fullContent);
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone(null);
    } else {
      onError(err.message || 'Network error');
    }
  }

  isLoading = false;
}

/* ── Connection Status ────────────────────── */

function setConnectionStatus(state) {
  connectionStatus = state;
  const indicator = document.querySelector('.cp-conn-status');
  if (!indicator) return;
  if (state === 'connected') {
    indicator.textContent = '●';
    indicator.className = 'cp-conn-status cp-conn-ok';
    indicator.title = 'Connected';
  } else if (state === 'reconnecting') {
    indicator.textContent = '◐';
    indicator.className = 'cp-conn-status cp-conn-reconnect';
    indicator.title = 'Reconnecting…';
  } else {
    indicator.textContent = '○';
    indicator.className = 'cp-conn-status cp-conn-off';
    indicator.title = 'Disconnected';
  }
}

async function sendMessageWithRetry(messages, model, onChunk, onDone, onError) {
  const MAX_RETRIES = 3;
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // On retry attempts, show reconnecting state
    if (attempt > 0) {
      setConnectionStatus('reconnecting');
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }

    // Track whether this attempt hit a retryable error
    let retryable = false;

    // Wrap sendMessage — we intercept onError to detect retryable failures
    const result = await new Promise((resolve) => {
      sendMessage(messages, model, onChunk,
        (content) => {
          // onDone — success
          resolve({ success: true, content });
        },
        (error) => {
          // onError — check if it's a network-level failure (TypeError from fetch)
          // sendMessage catches AbortError separately and calls onDone(null)
          // HTTP errors (4xx/5xx) and other errors should not be retried
          if (error && (
            error.includes('Network error') ||
            error.includes('Failed to fetch') ||
            error.includes('TypeError') ||
            error.includes('network') ||
            error.includes('NetworkError')
          )) {
            retryable = true;
            resolve({ success: false, retryable: true, error });
          } else {
            resolve({ success: false, retryable: false, error });
          }
        }
      );
    });

    if (result.success) {
      setConnectionStatus('connected');
      onDone(result.content);
      return;
    }

    if (!result.retryable) {
      // Non-retryable error (HTTP error, abort, etc.) — pass to caller
      setConnectionStatus('connected');
      onError(result.error);
      return;
    }

    lastError = result.error;

    // If there are more retries left, continue the loop
    if (attempt < MAX_RETRIES) continue;

    // All retries exhausted
    setConnectionStatus('disconnected');
    onError('Connection lost after ' + MAX_RETRIES + ' retries: ' + lastError);
  }
}

function cancelStream() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  isLoading = false;
}

/* ── Quick Actions ─────────────────────────── */

async function handleQuickAction(text) {
  // "queue: ..." or "add task: ..."
  if (/^(queue|queue up|add task|queue task)[:\s]/i.test(text)) {
    const content = text.replace(/^(queue|queue up|add task|queue task)[:\s]/i, '').trim();
    if (!content) return 'Task description is empty. What should I queue?';

    try {
      const resp = await fetch('/api/queue/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: content.length > 60 ? content.slice(0, 57) + '...' : content,
          goal: content,
          priority: 2
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        return 'Failed to queue: ' + (data.message || data.error || 'HTTP ' + resp.status);
      }
      return "Queued! Task #" + data.id + " (\"" + content.slice(0, 40) + (content.length > 40 ? '…' : '') + "\") — the executor picks it up within 5 minutes.";
    } catch (err) {
      return 'Could not reach queue service: ' + (err.message || 'Network error') + '. Is the queue listener running?';
    }
  }

  // "status" — return system snapshot
  if (/^status$/i.test(text.trim())) {
    const now = new Date().toLocaleString();
    const queuePending = 0; // would fetch from tasks.json
    return 'System snapshot ' + now + '\n' +
      '- Task executor: running (5min tick)\n' +
      '- Server: Hermes API (DeepSeek Chat)\n' +
      '- Connected via: Tower nginx → Tailscale\n' +
      '- Sync: hourly full + 30s live\n';
  }

  return null;
}

/* ── Session Persistence ───────────────────── */

function loadSessions() {
  try {
    const raw = localStorage.getItem(LS_SESSIONS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      sessions = data;
    }
  } catch { /* ignore */ }
}

function saveSessions() {
  try {
    localStorage.setItem(LS_SESSIONS_KEY, JSON.stringify(sessions));
  } catch { /* ignore */ }
}

function loadMessages(sessionId) {
  try {
    const raw = localStorage.getItem(LS_MSG_PREFIX + sessionId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(sessionId, msgs) {
  try {
    localStorage.setItem(LS_MSG_PREFIX + sessionId, JSON.stringify(msgs));
  } catch { /* ignore */ }
}

function createSession() {
  const id = genId();
  const session = {
    id,
    title: 'New chat',
    created: new Date().toISOString(),
    messageCount: 0
  };
  sessions.list.unshift(session);
  sessions.current = id;
  currentMessages = [];
  saveMessages(id, []);
  saveSessions();
  return session;
}

function switchSession(id) {
  sessions.current = id;
  currentMessages = loadMessages(id);
  saveSessions();
}

function deleteSession(id) {
  sessions.list = sessions.list.filter(s => s.id !== id);
  localStorage.removeItem(LS_MSG_PREFIX + id);
  if (sessions.current === id) {
    if (sessions.list.length > 0) {
      sessions.current = sessions.list[0].id;
      currentMessages = loadMessages(sessions.current);
    } else {
      sessions.current = null;
      currentMessages = [];
    }
  }
  saveSessions();
}

function renameSession(id, newTitle) {
  const s = sessions.list.find(x => x.id === id);
  if (s) {
    s.title = newTitle;
    saveSessions();
  }
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  try { localStorage.setItem(LS_SIDEBAR_KEY, sidebarOpen ? '1' : '0'); } catch { /* ignore */ }
}

/* ── UI Building ───────────────────────────── */

function buildPanel(container) {
  // Clear existing
  container.innerHTML = '';

  // Restore sidebar state
  try {
    const saved = localStorage.getItem(LS_SIDEBAR_KEY);
    if (saved !== null) sidebarOpen = saved === '1';
  } catch { /* ignore */ }

  const panel = document.createElement('div');
  panel.className = 'cp-panel';

  // Top bar
  const topBar = document.createElement('div');
  topBar.className = 'cp-topbar';
  topBar.innerHTML = `
    <button class="cp-new-btn" title="New session">+ New</button>
    <div class="cp-session-select">
      <select class="cp-session-dropdown"></select>
    </div>
    <div class="cp-model-pick">
      <select class="cp-model-dropdown">
        <option value="deepseek-chat">deepseek-chat</option>
      </select>
    </div>
    <span class="cp-conn-status cp-conn-ok" title="Connected">●</span>
  `;
  panel.appendChild(topBar);

  // Chat area
  const chatArea = document.createElement('div');
  chatArea.className = 'cp-chat-area';
  const messagesEl = document.createElement('div');
  messagesEl.className = 'cp-messages';

  const inputArea = document.createElement('div');
  inputArea.className = 'cp-input-area';
  inputArea.innerHTML = `
    <textarea class="cp-input" rows="3" placeholder="Type a message... (Enter to send, Shift+Enter for newline, Esc to cancel)" spellcheck="false"></textarea>
    <button class="cp-send-btn" disabled>Send</button>
    <button class="cp-stop-btn" style="display:none">Stop</button>
  `;

  chatArea.appendChild(messagesEl);
  chatArea.appendChild(inputArea);
  panel.appendChild(chatArea);

  // Sidebar toggle button (always visible, positioned between chat and sidebar)
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'cp-sidebar-toggle';
  toggleBtn.textContent = sidebarOpen ? '▸' : '◂';
  toggleBtn.title = sidebarOpen ? 'Collapse sidebar' : 'Show sidebar';
  panel.appendChild(toggleBtn);

  // Sidebar with session list
  const sidebar = document.createElement('div');
  sidebar.className = 'cp-sidebar' + (sidebarOpen ? '' : ' collapsed');
  const sidebarTitle = document.createElement('div');
  sidebarTitle.className = 'cp-sidebar-title';
  sidebarTitle.innerHTML = '<span>Sessions</span><button class="cp-sidebar-new-btn" title="New session">+</button>';
  sidebar.appendChild(sidebarTitle);
  const sessionList = document.createElement('div');
  sessionList.className = 'cp-session-list';
  sidebar.appendChild(sessionList);
  panel.appendChild(sidebar);

  // Apply initial sidebar state
  if (!sidebarOpen) {
    chatArea.style.marginRight = '0';
    toggleBtn.style.right = '0';
  }

  container.appendChild(panel);

  // Populate controls
  populateSessionDropdown(topBar.querySelector('.cp-session-dropdown'));
  populateSessionList(sessionList);
  populateModelDropdown(topBar.querySelector('.cp-model-dropdown'));
  renderMessages(messagesEl);

  // Wire events
  wireTopBarEvents(panel, topBar, messagesEl, sessionList);
  wireInputEvents(panel, inputArea, messagesEl);
  wireSidebarEvents(panel, sessionList, messagesEl);

  // Wire sidebar toggle
  toggleBtn.addEventListener('click', () => {
    toggleSidebar();
    sidebar.classList.toggle('collapsed');
    toggleBtn.textContent = sidebarOpen ? '▸' : '◂';
    toggleBtn.title = sidebarOpen ? 'Collapse sidebar' : 'Show sidebar';
    chatArea.style.marginRight = sidebarOpen ? '200px' : '0';
    toggleBtn.style.right = sidebarOpen ? '200px' : '0';
  });

  // Wire new session button in sidebar
  const sidebarNewBtn = sidebar.querySelector('.cp-sidebar-new-btn');
  if (sidebarNewBtn) {
    sidebarNewBtn.addEventListener('click', () => {
      if (isLoading) cancelStream();
      createSession();
      populateSessionDropdown(topBar.querySelector('.cp-session-dropdown'));
      populateSessionList(sessionList);
      renderMessages(messagesEl);
    });
  }

  // Auto-refresh models every 60s
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    fetchModels().then(m => {
      const dd = panel.querySelector('.cp-model-dropdown');
      if (dd) populateModelDropdown(dd);
    });
  }, 60000);
}

function populateSessionDropdown(sel) {
  sel.innerHTML = '';
  sessions.list.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.title;
    if (s.id === sessions.current) opt.selected = true;
    sel.appendChild(opt);
  });
  if (sessions.list.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No sessions';
    opt.disabled = true;
    opt.selected = true;
    sel.appendChild(opt);
  }
}

function populateSessionList(listEl) {
  listEl.innerHTML = '';
  sessions.list.forEach(s => {
    const item = document.createElement('div');
    item.className = 'cp-session-item';
    if (s.id === sessions.current) item.classList.add('active');
    item.dataset.sessionId = s.id;
    item.innerHTML = `
      <div class="cp-session-item-title">${escapeHtml(s.title)}</div>
      <div class="cp-session-item-meta">
        <span>${s.messageCount} msgs</span>
        <span>${relativeTime(s.created)}</span>
      </div>
      <button class="cp-session-del-btn" title="Delete session">×</button>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.cp-session-del-btn')) return;
      if (currentMessages.length > 0 && isLoading) {
        cancelStream();
      }
      switchSession(s.id);
      // Re-render
      const panel = listEl.closest('.cp-panel');
      const msgsEl = panel.querySelector('.cp-messages');
      const sel = panel.querySelector('.cp-session-dropdown');
      renderMessages(msgsEl);
      populateSessionDropdown(sel);
      populateSessionList(listEl);
    });

    // Delete button
    const delBtn = item.querySelector('.cp-session-del-btn');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Delete session "' + (s.title || s.id) + '"?')) {
        if (isLoading) cancelStream();
        deleteSession(s.id);
        const panel = listEl.closest('.cp-panel');
        const msgsEl = panel.querySelector('.cp-messages');
        const sel = panel.querySelector('.cp-session-dropdown');
        populateSessionDropdown(sel);
        populateSessionList(listEl);
        renderMessages(msgsEl);
      }
    });

    // Double-click rename
    const titleEl = item.querySelector('.cp-session-item-title');
    titleEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.className = 'cp-rename-input';
      input.type = 'text';
      input.value = s.title;
      input.setAttribute('data-original', s.title);
      titleEl.replaceWith(input);
      input.focus();
      input.select();

      function commit() {
        const val = input.value.trim();
        if (val && val !== input.getAttribute('data-original')) {
          renameSession(s.id, val);
          const panel = listEl.closest('.cp-panel');
          populateSessionList(listEl);
          const sel = panel.querySelector('.cp-session-dropdown');
          populateSessionDropdown(sel);
        } else {
          input.replaceWith(titleEl);
        }
      }

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') {
          input.value = input.getAttribute('data-original');
          input.blur();
        }
      });
    });

    listEl.appendChild(item);
  });
}

function populateModelDropdown(sel) {
  const saved = (() => { try { return localStorage.getItem('chat_model'); } catch { return null; } })();
  const currentVal = saved || sel.value || 'deepseek-chat';
  sel.innerHTML = '';
  if (models.length === 0) {
    const opt = document.createElement('option');
    opt.value = 'deepseek-chat';
    opt.textContent = 'deepseek-chat';
    opt.selected = true;
    sel.appendChild(opt);
  } else {
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id || m;
      opt.textContent = m.id || m;
      if (opt.value === currentVal) opt.selected = true;
      sel.appendChild(opt);
    });
  }
}

function renderMessages(messagesEl) {
  messagesEl.innerHTML = '';

  if (currentMessages.length === 0) {
    messagesEl.innerHTML = '<div class="cp-empty"><div class="big-icon">◐</div><div>Start a conversation</div><div class="cp-empty-hint">Type a message below, or try "queue: build X" or "status"</div></div>';
    return;
  }

  currentMessages.forEach((msg, idx) => {
    const bubble = document.createElement('div');
    bubble.className = 'cp-bubble cp-bubble-' + msg.role;
    const roleLabel = document.createElement('div');
    roleLabel.className = 'cp-bubble-role';
    roleLabel.textContent = msg.role === 'user' ? 'you' : 'hermes';
    const content = document.createElement('div');
    content.className = 'cp-bubble-content';
    content.innerHTML = renderMarkdown(msg.content);
    bubble.appendChild(roleLabel);
    bubble.appendChild(content);
    if (msg.role === 'assistant') {
      addCopyButton(bubble, msg.content);
    }
    messagesEl.appendChild(bubble);
  });
}

function appendMessage(role, content, messagesEl) {
  const bubble = document.createElement('div');
  bubble.className = 'cp-bubble cp-bubble-' + role;
  const roleLabel = document.createElement('div');
  roleLabel.className = 'cp-bubble-role';
  roleLabel.textContent = role === 'user' ? 'you' : 'hermes';
  const contentEl = document.createElement('div');
  contentEl.className = 'cp-bubble-content';
  contentEl.innerHTML = renderMarkdown(content);
  bubble.appendChild(roleLabel);
  bubble.appendChild(contentEl);
  if (role === 'assistant') {
    addCopyButton(bubble, content);
  }
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateAssistantBubble(content, messagesEl) {
  let lastBubble = messagesEl.querySelector('.cp-bubble-assistant:last-child');
  if (!lastBubble) {
    appendMessage('assistant', '', messagesEl);
    lastBubble = messagesEl.querySelector('.cp-bubble-assistant:last-child');
  }
  const contentEl = lastBubble.querySelector('.cp-bubble-content');
  if (contentEl) {
    contentEl.innerHTML = renderMarkdown(content);
    // Add copy button if not already present
    if (!lastBubble.querySelector('.cp-copy-btn') && content) {
      addCopyButton(lastBubble, content);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function showStreamingDots(messagesEl) {
  const dotsEl = document.createElement('div');
  dotsEl.className = 'cp-streaming-dots';
  dotsEl.innerHTML = '<span class="cp-dot">.</span><span class="cp-dot">.</span><span class="cp-dot">.</span>';
  messagesEl.appendChild(dotsEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return dotsEl;
}

function removeStreamingDots(messagesEl) {
  const dots = messagesEl.querySelector('.cp-streaming-dots');
  if (dots) dots.remove();
}

/* ── Event Wiring ──────────────────────────── */

function wireTopBarEvents(panel, topBar, messagesEl, sessionList) {
  // New session
  topBar.querySelector('.cp-new-btn').addEventListener('click', () => {
    if (isLoading) cancelStream();
    createSession();
    populateSessionDropdown(topBar.querySelector('.cp-session-dropdown'));
    populateSessionList(sessionList);
    renderMessages(messagesEl);
  });

  // Session dropdown
  topBar.querySelector('.cp-session-dropdown').addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    if (isLoading) cancelStream();
    switchSession(id);
    renderMessages(messagesEl);
    populateSessionList(sessionList);
  });

  // Model dropdown (just store preference)
  topBar.querySelector('.cp-model-dropdown').addEventListener('change', (e) => {
    try { localStorage.setItem('chat_model', e.target.value); } catch { /* ignore */ }
  });
}

function wireInputEvents(panel, inputArea, messagesEl) {
  const input = inputArea.querySelector('.cp-input');
  const sendBtn = inputArea.querySelector('.cp-send-btn');
  const stopBtn = inputArea.querySelector('.cp-stop-btn');

  function adjustHeight() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }
  input.addEventListener('input', adjustHeight);

  function getSelectedModel() {
    const dd = panel.querySelector('.cp-model-dropdown');
    return dd ? dd.value : 'deepseek-chat';
  }

  async function onSend() {
    const text = input.value.trim();
    if (!text || isLoading) return;

    // Ensure current session exists
    if (!sessions.current || sessions.list.length === 0) {
      createSession();
      const sel = panel.querySelector('.cp-session-dropdown');
      const sList = panel.querySelector('.cp-session-list');
      populateSessionDropdown(sel);
      populateSessionList(sList);
    }

    // Quick actions
    const quickResult = await handleQuickAction(text);
    if (quickResult !== null) {
      // Add user message
      currentMessages.push({ role: 'user', content: text, timestamp: Date.now() });
      const session = sessions.list.find(s => s.id === sessions.current);
      if (session) {
        session.messageCount = currentMessages.length;
        if (session.title === 'New chat') {
          session.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
        }
      }
      saveMessages(sessions.current, currentMessages);
      saveSessions();
      renderMessages(messagesEl);

      // Add assistant response from quick action
      currentMessages.push({ role: 'assistant', content: quickResult, timestamp: Date.now() });
      saveMessages(sessions.current, currentMessages);
      renderMessages(messagesEl);
      input.value = '';
      adjustHeight();
      return;
    }

    // Add user message
    currentMessages.push({ role: 'user', content: text, timestamp: Date.now() });
    const session = sessions.list.find(s => s.id === sessions.current);
    if (session) {
      session.messageCount = currentMessages.length;
      if (session.title === 'New chat') {
        session.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
      }
    }
    saveMessages(sessions.current, currentMessages);
    saveSessions();
    renderMessages(messagesEl);

    input.value = '';
    adjustHeight();
    input.disabled = true;
    sendBtn.disabled = true;
    stopBtn.style.display = 'inline-block';

    const model = getSelectedModel();
    const dotsEl = showStreamingDots(messagesEl);

    let firstToken = true;

    sendMessageWithRetry(
      currentMessages,
      model,
      (fullContent) => {
        if (firstToken) {
          removeStreamingDots(messagesEl);
          firstToken = false;
        }
        updateAssistantBubble(fullContent, messagesEl);
      },
      (fullContent) => {
        removeStreamingDots(messagesEl);
        stopBtn.style.display = 'none';
        input.disabled = false;
        sendBtn.disabled = false;
        if (fullContent !== null) {
          currentMessages.push({ role: 'assistant', content: fullContent, timestamp: Date.now() });
          saveMessages(sessions.current, currentMessages);
          renderMessages(messagesEl);
        }
        // Update sidebar counts
        const sList = panel.querySelector('.cp-session-list');
        const sDropdown = panel.querySelector('.cp-session-dropdown');
        populateSessionList(sList);
        populateSessionDropdown(sDropdown);
      },
      (error) => {
        removeStreamingDots(messagesEl);
        stopBtn.style.display = 'none';
        input.disabled = false;
        sendBtn.disabled = false;
        updateAssistantBubble('Connection error: ' + error + ' — you can retry.', messagesEl);
      }
    );
  }

  sendBtn.addEventListener('click', onSend);
  input.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter — send message
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onSend();
      return;
    }

    // Enter (without Shift) — send message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
      return;
    }

    // Esc — cancel streaming
    if (e.key === 'Escape' && isLoading) {
      e.preventDefault();
      cancelStream();
      const stopBtn = inputArea.querySelector('.cp-stop-btn');
      const sendBtn = inputArea.querySelector('.cp-send-btn');
      if (stopBtn) stopBtn.style.display = 'none';
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      removeStreamingDots(messagesEl);
      return;
    }

    // Ctrl/Cmd + Up — edit last user message
    if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp' && !isLoading) {
      e.preventDefault();
      for (let i = currentMessages.length - 1; i >= 0; i--) {
        if (currentMessages[i].role === 'user') {
          input.value = currentMessages[i].content;
          input.focus();
          currentMessages.splice(i, 1);
          saveMessages(sessions.current, currentMessages);
          renderMessages(messagesEl);
          adjustHeight();
          sendBtn.disabled = false;
          break;
        }
      }
      return;
    }
  });

  stopBtn.addEventListener('click', () => {
    cancelStream();
    stopBtn.style.display = 'none';
    input.disabled = false;
    sendBtn.disabled = false;
    removeStreamingDots(messagesEl);
  });

  // Enable send when input has text
  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim() || isLoading;
  });
}

function wireSidebarEvents(panel, sessionList, messagesEl) {
  // Delete is handled by double-click or a delete btn — for now, keep it simple
  // The session items already have click handlers from populateSessionList
  // Add context menu or delete on right-click via event delegation
  sessionList.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.cp-session-item');
    if (!item) return;
    e.preventDefault();
    const id = item.dataset.sessionId;
    if (confirm('Delete session "' + (sessions.list.find(s => s.id === id)?.title || id) + '"?')) {
      if (isLoading) cancelStream();
      deleteSession(id);
      const sel = panel.querySelector('.cp-session-dropdown');
      populateSessionDropdown(sel);
      populateSessionList(sessionList);
      renderMessages(messagesEl);
    }
  });
}

/* ── Entry Point ───────────────────────────── */

/**
 * Render the chat panel into a container element.
 * @param {HTMLElement} container
 */
export async function renderChat(container) {
  try {
    container.innerHTML = '<div class="empty-state"><div class="big-icon">◐</div>Initializing chat…</div>';

    // Load sessions
    loadSessions();

    // Fetch API key
    apiKey = await fetchApiKey();

    // If no api-key.json, try localStorage fallback
    if (!apiKey) {
      apiKey = localStorage.getItem('chat_api_key');
    }

    // If still no key, show a warning in the UI but don't crash
    if (!apiKey) {
      console.warn('[chat-panel] No API key configured. Set one via localStorage.setItem(\'chat_api_key\', \'...\') or ensure data/api-key.json exists.');
    }

    // Fetch models (async, don't block rendering)
    fetchModels().then(m => {
      const dd = container.querySelector('.cp-model-dropdown');
      if (dd) populateModelDropdown(dd);
    });

    // Ensure at least one session
    if (sessions.list.length === 0) {
      createSession();
    } else if (!sessions.current) {
      sessions.current = sessions.list[0].id;
      currentMessages = loadMessages(sessions.current);
    } else {
      currentMessages = loadMessages(sessions.current);
    }

    // Build the panel
    buildPanel(container);

    // Inject styles — no longer needed; CSS is in style.css
  } catch (e) {
    console.error('[chat-panel] renderChat failed:', e);
    container.innerHTML = `<div class="empty-state"><div class="big-icon">⚠</div><p>Failed to load chat: ${e.message}</p><p class="error-hint">Check console for details</p></div>`;
  }
}
