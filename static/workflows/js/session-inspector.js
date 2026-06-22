/**
 * grainworks Session Inspector v0.2
 * Timeline view of subagent/delegate_task executions with live/history toggle.
 * Click a session card to open a slide-in detail panel showing tool call timeline.
 * Polls data/sessions-live.json every 5s in live mode. Zero dependencies. ES6 module.
 *
 * Import: import { renderSessionInspector } from './js/session-inspector.js';
 */

import { relativeTime, escapeHtml } from './shared-utils.js';

/* ── Data ──────────────────────────────────── */
let pollInterval = null;
let liveMode = true; // true = live, false = history
let highlightTimer = null;

/* ── Data fetching ─────────────────────── */

/**
 * Fetch a JSON endpoint with cache-busting.
 */
async function fetchJSON(url) {
  try {
    const resp = await fetch(url + '?_=' + Date.now());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Fetch tool call data for a specific session.
 */
async function fetchToolCalls(sessionId) {
  if (!sessionId) return null;
  return await fetchJSON('/v1/sessions/' + encodeURIComponent(sessionId) + '/tools');
}



 * Format duration in human-readable form.
 */
function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—';
  if (seconds < 60) return Math.round(seconds) + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h + 'h ' + m + 'm';
}

/* ── Status helpers ────────────────────── */

function statusMeta(status) {
  switch (status) {
    case 'completed':  return { cls: 'si-dot-green',  label: 'completed', icon: '✅' };
    case 'in_progress': return { cls: 'si-dot-blue',  label: 'in progress', icon: '🔄' };
    case 'failed':      return { cls: 'si-dot-red',   label: 'failed', icon: '❌' };
    case 'cancelled':   return { cls: 'si-dot-grey',  label: 'cancelled', icon: '⏹' };
    default:            return { cls: 'si-dot-grey',  label: status || 'unknown', icon: '◌' };
  }
}

/* ── Tool call helpers ─────────────────── */

/**
 * Truncate a string to a max length, appending … if truncated.
 */
function truncate(str, max) {
  if (!str) return '';
  const s = typeof str === 'string' ? str : JSON.stringify(str);
  if (s.length <= max) return s;
  return s.substring(0, max) + '…';
}

/* ── Build tool call timeline ──────────── */

function buildToolCallTimeline(toolCalls) {
  const container = document.createElement('div');
  container.className = 'si-timeline';

  if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'si-timeline-empty';
    empty.textContent = 'No tool calls recorded for this session.';
    container.appendChild(empty);
    return container;
  }

  toolCalls.forEach((tc, i) => {
    const entry = document.createElement('div');
    entry.className = 'si-tc-entry';

    // Connector line on the left
    const connector = document.createElement('div');
    connector.className = 'si-tc-connector';
    connector.innerHTML = '<div class="si-tc-dot"></div><div class="si-tc-line"></div>';
    entry.appendChild(connector);

    // Content
    const content = document.createElement('div');
    content.className = 'si-tc-content';

    // Header: timestamp + tool name
    const header = document.createElement('div');
    header.className = 'si-tc-header';

    const toolName = document.createElement('span');
    toolName.className = 'si-tc-name';
    toolName.textContent = tc.name || tc.tool || 'unknown';
    header.appendChild(toolName);

    if (tc.timestamp || tc.ts || tc.started_at) {
      const ts = document.createElement('span');
      ts.className = 'si-tc-ts';
      ts.textContent = relativeTime(tc.timestamp || tc.ts || tc.started_at);
      header.appendChild(ts);
    }

    content.appendChild(header);

    // Arguments
    if (tc.arguments || tc.args || tc.input) {
      const argsBlock = document.createElement('div');
      argsBlock.className = 'si-tc-block';
      argsBlock.innerHTML = '<div class="si-tc-block-label">arguments</div><pre class="si-tc-code">' + escapeHtml(truncate(tc.arguments || tc.args || tc.input, 160)) + '</pre>';
      content.appendChild(argsBlock);
    }

    // Result summary
    if (tc.result !== undefined || tc.output !== undefined || tc.response !== undefined) {
      const resultBlock = document.createElement('div');
      resultBlock.className = 'si-tc-block';
      const rawResult = tc.result !== undefined ? tc.result : (tc.output !== undefined ? tc.output : tc.response);
      const resultStr = typeof rawResult === 'object' ? JSON.stringify(rawResult, null, 2) : String(rawResult);
      resultBlock.innerHTML = '<div class="si-tc-block-label">result</div><pre class="si-tc-code si-tc-code-result">' + escapeHtml(truncate(resultStr, 260)) + '</pre>';
      content.appendChild(resultBlock);
    }

    // Duration
    if (tc.duration || tc.duration_seconds) {
      const dur = document.createElement('div');
      dur.className = 'si-tc-duration';
      dur.textContent = 'duration: ' + (tc.duration_seconds ? formatDuration(tc.duration_seconds) : tc.duration);
      content.appendChild(dur);
    }

    entry.appendChild(content);
    container.appendChild(entry);
  });

  return container;
}

/* ── Slide-in detail overlay ───────────── */

function buildDetailOverlay(session) {
  const overlay = document.createElement('div');
  overlay.className = 'si-detail-overlay';

  const panel = document.createElement('div');
  panel.className = 'si-detail-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'si-detail-header';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'si-detail-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', () => {
    overlay.remove();
  });
  header.appendChild(closeBtn);

  const title = document.createElement('div');
  title.className = 'si-detail-title';
  title.textContent = session.task_title || session.goal || 'Task #' + session.task_id;
  header.appendChild(title);

  panel.appendChild(header);

  // Meta info row
  const meta = document.createElement('div');
  meta.className = 'si-detail-meta';

  const metaItems = [];
  if (session.id) metaItems.push({ label: 'session', value: session.id.substring(0, 12) + '…' });
  if (session.status) {
    const sm = statusMeta(session.status);
    metaItems.push({ label: 'status', value: sm.label });
  }
  if (session.duration_seconds || session.duration_seconds === 0)
    metaItems.push({ label: 'duration', value: formatDuration(session.duration_seconds) });
  if (session.model) metaItems.push({ label: 'model', value: session.model });
  if (session.started_at)
    metaItems.push({ label: 'started', value: new Date(session.started_at).toLocaleTimeString() });

  metaItems.forEach(p => {
    const item = document.createElement('span');
    item.className = 'si-detail-meta-item';
    item.innerHTML = '<span class="si-meta-label">' + p.label + '</span><span class="si-meta-val">' + p.value + '</span>';
    meta.appendChild(item);
  });

  panel.appendChild(meta);

  // Goal section
  if (session.goal) {
    const sec = document.createElement('div');
    sec.className = 'si-detail-section';
    sec.innerHTML = '<div class="si-detail-section-title">goal</div><div class="si-detail-text">' + escapeHtml(session.goal) + '</div>';
    panel.appendChild(sec);
  }

  // Context section (collapsible)
  if (session.context) {
    const sec = document.createElement('div');
    sec.className = 'si-detail-section';
    sec.innerHTML = '<div class="si-detail-section-title">context</div><div class="si-detail-text si-detail-text-sm">' + escapeHtml(session.context) + '</div>';
    panel.appendChild(sec);
  }

  // Result summary
  if (session._result_summary) {
    const sec = document.createElement('div');
    sec.className = 'si-detail-section';
    sec.innerHTML = '<div class="si-detail-section-title">result</div><div class="si-detail-text">' + escapeHtml(session._result_summary) + '</div>';
    panel.appendChild(sec);
  }

  // Error section
  if (session._error) {
    const sec = document.createElement('div');
    sec.className = 'si-detail-section';
    sec.innerHTML = '<div class="si-detail-section-title si-error-label">error</div><div class="si-detail-text si-error-text">' + escapeHtml(session._error) + '</div>';
    panel.appendChild(sec);
  }

  // Tool call timeline section
  const toolsSection = document.createElement('div');
  toolsSection.className = 'si-detail-section';
  toolsSection.innerHTML = '<div class="si-detail-section-title si-tools-title">tool calls</div>';

  const toolsContent = document.createElement('div');
  toolsContent.className = 'si-tools-content';
  toolsContent.innerHTML = '<div class="empty-state" style="padding: 16px; font-size: 11px; color: var(--fg-dim);">Loading tool calls…</div>';
  toolsSection.appendChild(toolsContent);
  panel.appendChild(toolsSection);

  // Fetch tool calls asynchronously
  fetchToolCalls(session.id).then(toolCalls => {
    toolsContent.innerHTML = '';
    toolsContent.appendChild(buildToolCallTimeline(toolCalls));
  }).catch(() => {
    toolsContent.innerHTML = '<div class="empty-state" style="padding: 16px; font-size: 11px; color: var(--fg-dim);">Tool data unavailable.</div>';
  });

  overlay.appendChild(panel);

  // Close on overlay backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Close on Escape key
  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', keyHandler);
    }
  };
  document.addEventListener('keydown', keyHandler);

  return overlay;
}

/* ── Build session list items ──────────── */

/**
 * POST to /v1/sessions/{id}/stop and handle the response.
 */
async function stopSession(sessionId, btnEl, cardEl, dotEl) {
  btnEl.disabled = true;
  btnEl.textContent = 'Stopping…';
  btnEl.classList.add('si-stop-loading');

  const existingErr = cardEl.querySelector('.si-stop-error');
  if (existingErr) existingErr.remove();

  try {
    const resp = await fetch('/v1/sessions/' + encodeURIComponent(sessionId) + '/stop', { method: 'POST' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    // Success: update card to cancelled state
    dotEl.className = 'si-status-dot si-dot-grey';
    dotEl.title = 'cancelled';
    btnEl.remove();

    // Update status in info row
    const statusVal = cardEl.querySelector('.si-info-val');
    if (statusVal) statusVal.textContent = 'cancelled';

  } catch (err) {
    btnEl.disabled = false;
    btnEl.textContent = '⏹ Stop';
    btnEl.classList.remove('si-stop-loading');

    const errEl = document.createElement('div');
    errEl.className = 'si-body-section si-stop-error';
    errEl.innerHTML = `<div class="si-body-label si-error-label">stop error</div><div class="si-body-text si-error-text">${escapeHtml(err.message)}</div>`;
    cardEl.appendChild(errEl);
  }
}

function buildSessionEntry(session) {
  const meta = statusMeta(session.status);
  const li = document.createElement('div');
  li.className = 'si-session';
  if (session._is_new) li.classList.add('si-session-new');

  // Header: status icon + task title + timestamp
  const header = document.createElement('div');
  header.className = 'si-session-header';

  const dot = document.createElement('span');
  dot.className = 'si-status-dot ' + meta.cls;
  dot.title = meta.label;
  header.appendChild(dot);

  const titleEl = document.createElement('span');
  titleEl.className = 'si-task-title';
  titleEl.textContent = session.task_title || session.goal || 'Task #' + session.task_id;
  header.appendChild(titleEl);

  const timeEl = document.createElement('span');
  timeEl.className = 'si-timestamp';
  timeEl.textContent = relativeTime(session.started_at || session.created_at);
  header.appendChild(timeEl);

  // Stop button — only for active sessions
  if (session.status === 'in_progress') {
    const stopBtn = document.createElement('button');
    stopBtn.className = 'si-stop-btn';
    stopBtn.textContent = '⏹ Stop';
    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stopSession(session.id, stopBtn, li, dot);
    });
    header.appendChild(stopBtn);
  }

  li.appendChild(header);

  // Info row: ID, status, duration
  const info = document.createElement('div');
  info.className = 'si-session-info';

  const infoParts = [];
  if (session.id) infoParts.push({ label: 'session', value: session.id.substring(0, 12) + '…' });
  if (session.status) infoParts.push({ label: 'status', value: meta.label });
  if (session.duration_seconds || session.duration_seconds === 0)
    infoParts.push({ label: 'duration', value: formatDuration(session.duration_seconds) });
  if (session.started_at)
    infoParts.push({ label: 'started', value: new Date(session.started_at).toLocaleTimeString() });

  infoParts.forEach(p => {
    const part = document.createElement('span');
    part.className = 'si-info-item';
    part.innerHTML = `<span class="si-info-label">${p.label}</span><span class="si-info-val">${p.value}</span>`;
    info.appendChild(part);
  });

  li.appendChild(info);

  // Click opens detail overlay (prev click handled by stop button)
  header.style.cursor = 'pointer';
  header.addEventListener('click', () => {
    // Don't open if clicking the stop button
    const overlay = buildDetailOverlay(session);
    document.body.appendChild(overlay);
  });

  return li;
}



/* ── Build full timeline ───────────────── */

function buildTimeline(sessions) {
  if (!sessions || sessions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="big-icon">◉</div><div style="margin-top: 8px; font-size: 11px; color: var(--fg-dim);">No sessions yet</div>';
    return empty;
  }

  const list = document.createElement('div');
  list.className = 'si-list';

  sessions.forEach(s => {
    list.appendChild(buildSessionEntry(s));
  });

  return list;
}

/* ── Build the full inspector dashboard ── */

function buildDashboard(data) {
  const container = document.createElement('div');
  container.className = 'si-dashboard';

  // Mode toggle bar
  const modeBar = document.createElement('div');
  modeBar.className = 'si-mode-bar';

  const liveBtn = document.createElement('button');
  liveBtn.className = 'si-mode-btn' + (liveMode ? ' active' : '');
  liveBtn.dataset.mode = 'live';
  liveBtn.textContent = '⟳ Live';

  const histBtn = document.createElement('button');
  histBtn.className = 'si-mode-btn' + (!liveMode ? ' active' : '');
  histBtn.dataset.mode = 'history';
  histBtn.textContent = '◷ History';

  liveBtn.addEventListener('click', () => switchMode('live'));
  histBtn.addEventListener('click', () => switchMode('history'));

  modeBar.appendChild(liveBtn);
  modeBar.appendChild(histBtn);
  container.appendChild(modeBar);

  // Updated-at indicator
  if (data && data._updated_at) {
    const updated = document.createElement('div');
    updated.className = 'si-updated';
    updated.textContent = 'updated ' + relativeTime(data._updated_at);
    container.appendChild(updated);
  }

  // Extract session array from whichever data format
  let sessions = [];
  if (liveMode) {
    sessions = data?.sessions || [];
  } else {
    // History mode: combine completed and failed
    if (data) {
      if (data.completed) sessions = sessions.concat(data.completed.map(s => ({ ...s, _is_history: true })));
      if (data.failed) sessions = sessions.concat(data.failed.map(s => ({ ...s, _is_history: true })));
    }
    // Sort by most recent
    sessions.sort((a, b) => {
      const tA = new Date(a.started_at || a.created_at || 0).getTime();
      const tB = new Date(b.started_at || b.created_at || 0).getTime();
      return tB - tA;
    });
  }

  container.appendChild(buildTimeline(sessions));

  return container;
}

function switchMode(mode) {
  liveMode = mode === 'live';
  reRender();
}

function reRender() {
  const root = document.getElementById('session-container');
  if (!root) return;
  root.innerHTML = '';
  root.appendChild(buildDashboard(sessionData));
}

/* ── Entry points ──────────────────────── */

/**
 * Render the session inspector into a container element.
 * In live mode, polls every 5s. In history mode, loads task-history.json once.
 * @param {HTMLElement} container
 */
export async function renderSessionInspector(container) {
  container.innerHTML = '';
  container.id = 'session-container';

  // Inject inline styles once
  if (!document.querySelector('style[data-session-inspector]')) {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-session-inspector', '');
    styleEl.textContent = inlineStyles();
    document.head.appendChild(styleEl);
  }

  // Show loading
  container.innerHTML = '<div class="empty-state" style="padding: 40px;"><div class="big-icon">◉</div>Loading sessions…</div>';

  // Initial fetch
  await fetchAndRender();

  // Poll every 5s in live mode
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    if (liveMode) {
      await fetchAndRender();
    }
  }, 5000);
}

async function fetchAndRender() {
  const url = liveMode ? './data/sessions-live.json' : './data/task-history.json';
  const data = await fetchJSON(url);
  if (data) {
    sessionData = data;
    reRender();
  }
}

/**
 * Stop the session inspector poll interval.
 */
export function stopSessionInspector() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/* ── Inline CSS (self-contained module) ── */

function inlineStyles() {
  return `
/* ── Session Inspector ─────────────────── */

.si-dashboard {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Mode bar */
.si-mode-bar {
  display: flex;
  gap: 4px;
  background: var(--bg-panel);
  border-radius: 6px;
  padding: 3px;
  border: 1px solid var(--border);
  width: fit-content;
}

.si-mode-btn {
  background: transparent;
  border: none;
  border-radius: 4px;
  padding: 6px 16px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-dim);
  cursor: pointer;
  transition: all 0.15s;
}

.si-mode-btn:hover {
  color: var(--fg);
}

.si-mode-btn.active {
  color: var(--accent);
  background: rgba(0, 204, 102, 0.1);
  font-weight: 600;
}

/* Updated-at */
.si-updated {
  font-size: 9px;
  color: var(--fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Session list */
.si-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex: 1;
  padding-bottom: 16px;
}

/* Session entry */
.si-session {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 14px;
  transition: border-color 0.2s;
}

.si-session:hover {
  border-color: var(--border-light);
}

/* New session highlight animation */
.si-session-new {
  animation: si-highlight 2s ease-out;
}

@keyframes si-highlight {
  0%   { background: rgba(0, 204, 102, 0.08); border-color: var(--accent-dim); }
  100% { background: var(--bg-panel); border-color: var(--border); }
}

/* Header row */
.si-session-header {
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.si-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

.si-status-dot.si-dot-green { background: var(--accent); box-shadow: 0 0 4px var(--accent-dim); }
.si-status-dot.si-dot-blue  { background: #4488ff; box-shadow: 0 0 4px rgba(68,136,255,0.4); }
.si-status-dot.si-dot-red   { background: var(--danger); box-shadow: 0 0 4px rgba(204,51,51,0.4); }
.si-status-dot.si-dot-grey  { background: #555; }

.si-task-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.si-timestamp {
  font-size: 10px;
  color: var(--fg-dim);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

/* Stop button */
.si-stop-btn {
  background: transparent;
  border: 1px solid var(--danger);
  border-radius: 4px;
  color: var(--danger);
  font-size: 9px;
  padding: 2px 8px;
  cursor: pointer;
  font-family: var(--font-mono);
  flex-shrink: 0;
  transition: all 0.15s;
}

.si-stop-btn:hover {
  background: rgba(204,51,51,0.1);
}

.si-stop-loading {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Info row */
.si-session-info {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.si-info-item {
  font-size: 9px;
  font-family: var(--font-mono);
  color: var(--fg-dim);
  display: flex;
  gap: 4px;
}

.si-info-label {
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.si-info-val {
  color: var(--fg-alt);
}

/* Session body (deprecated — replaced by detail overlay) */
.si-session-body {
  display: none;
}

/* ── Slide-in Detail Overlay ───────────── */

.si-detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.6);
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}

.si-detail-panel {
  width: 480px;
  max-width: 90vw;
  background: var(--bg-alt);
  border-left: 1px solid var(--border);
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  animation: si-slideIn 0.15s ease-out;
}

@keyframes si-slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.si-detail-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 16px;
}

.si-detail-close {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--fg-dim);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 8px;
  font-family: var(--font-mono);
  line-height: 1;
  flex-shrink: 0;
}

.si-detail-close:hover {
  border-color: var(--fg-dim);
  color: var(--fg);
}

.si-detail-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
  flex: 1;
  line-height: 1.4;
}

/* Detail meta */
.si-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.si-detail-meta-item {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--fg-dim);
  display: flex;
  gap: 4px;
}

.si-meta-label {
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.si-meta-val {
  color: var(--fg-alt);
}

/* Detail sections */
.si-detail-section {
  margin-bottom: 14px;
}

.si-detail-section-title {
  font-size: 10px;
  color: var(--fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}

.si-tools-title {
  color: var(--accent);
  border-bottom-color: var(--accent-dim);
}

.si-detail-text {
  font-size: 12px;
  color: var(--fg);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.si-detail-text-sm {
  font-size: 11px;
  color: var(--fg-alt);
}

.si-error-label {
  color: var(--danger);
  border-bottom-color: rgba(204,51,51,0.3);
}

.si-error-text {
  color: var(--danger);
  font-size: 11px;
}

/* Tool call timeline */
.si-tools-content {
  min-height: 40px;
}

.si-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding-left: 4px;
}

.si-timeline-empty {
  font-size: 11px;
  color: var(--fg-dim);
  padding: 12px 0;
  font-style: italic;
}

.si-tc-entry {
  display: flex;
  gap: 10px;
  position: relative;
}

/* Connector line */
.si-tc-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 12px;
  flex-shrink: 0;
}

.si-tc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  margin-top: 4px;
}

.si-tc-line {
  width: 1px;
  flex: 1;
  background: var(--border);
  min-height: 100%;
}

.si-tc-entry:last-child .si-tc-line {
  display: none;
}

/* Tool call content */
.si-tc-content {
  flex: 1;
  padding-bottom: 14px;
  min-width: 0;
}

.si-tc-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.si-tc-name {
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--accent);
}

.si-tc-ts {
  font-size: 9px;
  color: var(--fg-dim);
  font-family: var(--font-mono);
}

.si-tc-block {
  margin-top: 4px;
}

.si-tc-block-label {
  font-size: 8px;
  color: var(--fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 2px;
}

.si-tc-code {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--fg-alt);
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 8px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
  margin: 0;
  overflow-x: auto;
  max-height: 120px;
  overflow-y: auto;
}

.si-tc-code-result {
  max-height: 160px;
}

.si-tc-duration {
  font-size: 9px;
  color: var(--fg-dim);
  font-family: var(--font-mono);
  margin-top: 4px;
}

/* General empty state */
.empty-state {
  text-align: center;
  padding: 24px;
}

.big-icon {
  font-size: 24px;
  opacity: 0.3;
}

@media (max-width: 800px) {
  .si-detail-panel { width: 100%; max-width: 100%; }
}
@media (max-width: 600px) {
  .si-detail-panel { width: 100%; max-width: 100%; padding: 12px; }
  .si-detail-meta { flex-direction: column; gap: 4px; }
  .si-detail-meta-item { font-size: 9px; }
  .si-session { padding: 8px 10px; }
  .si-task-title { font-size: 11px; }
  .si-timestamp { font-size: 9px; }
}
`;
}
