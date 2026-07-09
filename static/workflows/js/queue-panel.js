/**
 * grainworks Queue Panel v0.2
 * Kanban board for the task queue with inline actions, batch mode,
 * task templates, filters/saved views, and backlog graph.
 * Zero dependencies. ES6 module.
 *
 * Import: import { renderQueue } from './js/queue-panel.js';
 */

import { relativeTime, escapeHtml } from './shared-utils.js';

let tasksCache = null;
let knownCompletedIds = new Set();
let refreshInterval = null;
let _queueFetchTime = null;
let _freshTicker = null;
const STATUS_COLUMNS = [
  { key: 'pending',     label: 'PENDING' },
  { key: 'in_progress', label: 'IN PROGRESS' },
  { key: 'completed',   label: 'COMPLETED' },
  { key: 'failed',      label: 'FAILED' },
  { key: 'cancelled',   label: 'CANCELLED' },
  { key: 'waiting',     label: 'WAITING' },
  { key: 'deferred',    label: 'DEFERRED' },
];

const PRIORITY_LABEL = ['', 'low', 'normal', 'high', 'critical', 'emergency'];

/* ── Data ──────────────────────────────── */

async function fetchTasks() {
  try {
    const resp = await fetch('./data/tasks.json?_=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch { return null; }
}

async function fetchHistory() {
  try {
    const resp = await fetch('./data/task-history.json?_=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch { return null; }
}

async function fetchTemplates() {
  try {
    const resp = await fetch('./data/task-templates.json?_=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch { return null; }
}

function priorityClass(p) {
  switch (p) {
    case 5: return 'qp-pri-critical';
    case 4: return 'qp-pri-high';
    case 3: return 'qp-pri-normal';
    case 2: return 'qp-pri-low';
    default: return 'qp-pri-lowest';
  }
}

/* ── API calls ──────────────────────────── */

async function apiPatch(id, body) {
  try {
    const resp = await fetch('/api/queue/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return resp.ok;
  } catch { return false; }
}

async function apiPost(path, body) {
  try {
    const resp = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return resp.ok;
  } catch { return false; }
}

/* ── Build board ────────────────────────── */

let batchMode = false;
let selectedIds = new Set();
let currentFilter = 'all';
let savedViews = loadSavedViews();

function loadSavedViews() {
  try { return JSON.parse(localStorage.getItem('qp-saved-views') || 'null') || []; }
  catch { return []; }
}

function saveSavedViews(views) {
  try { localStorage.setItem('qp-saved-views', JSON.stringify(views)); }
  catch { /* quota exceeded or storage unavailable — silently ignore */ }
}

function buildBoard(tasks) {
  try {
    const board = document.createElement('div');
    board.className = 'qp-board';

    const newCompletedIds = markNewCompleted(tasks);

    const grouped = {};
    STATUS_COLUMNS.forEach(c => { grouped[c.key] = []; });
    tasks.forEach(t => {
      const g = grouped[t.status];
      if (g) g.push(t);
    });

    // Apply filter
    let visibleGroups = {};
    STATUS_COLUMNS.forEach(c => { visibleGroups[c.key] = grouped[c.key] || []; });

    // Filter out deferred that are still deferred
    if (currentFilter === 'deferred') {
      visibleGroups = { 'deferred': grouped['deferred'] || [] };
    } else if (currentFilter === 'active') {
      visibleGroups = {
        'pending': grouped['pending'] || [],
        'in_progress': grouped['in_progress'] || [],
        'waiting': grouped['waiting'] || [],
        'deferred': grouped['deferred'] || [],
      };
    } else if (currentFilter === 'done') {
      visibleGroups = {
        'completed': grouped['completed'] || [],
        'failed': grouped['failed'] || [],
        'cancelled': grouped['cancelled'] || [],
      };
    }

    const colKeys = Object.keys(visibleGroups);
    board.style.gridTemplateColumns = `repeat(${Math.min(colKeys.length, 4)}, 1fr)`;

    colKeys.forEach(colKey => {
      const colTasks = visibleGroups[colKey] || [];
      const col = STATUS_COLUMNS.find(c => c.key === colKey) || { key: colKey, label: colKey.toUpperCase() };
      const column = document.createElement('div');
      column.className = 'qp-column';
      column.dataset.status = colKey;

      // Header
      const header = document.createElement('div');
      header.className = 'qp-col-header';
      const title = document.createElement('span');
      title.className = 'qp-col-title';
      title.textContent = col.label;
      const count = document.createElement('span');
      count.className = 'qp-col-count';
      count.textContent = colTasks.length;
      header.appendChild(title);
      header.appendChild(count);

      // Batch mode toggle in header
      const batchToggle = document.createElement('span');
      batchToggle.className = 'qp-batch-toggle';
      batchToggle.textContent = batchMode ? '☑' : '☐';
      batchToggle.title = 'Toggle batch select mode';
      batchToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        batchMode = !batchMode;
        reRender();
      });
      header.appendChild(batchToggle);

      column.appendChild(header);

      // Add-task button (PENDING only)
      if (colKey === 'pending') {
        const addBtn = document.createElement('button');
        addBtn.className = 'qp-add-btn';
        addBtn.textContent = '+ Add task';
        addBtn.addEventListener('click', showAddForm);
        column.appendChild(addBtn);
      }

      // Drag-and-drop event listeners on all non-terminal columns
      const terminalCols = ['completed', 'failed', 'cancelled'];
      if (!terminalCols.includes(colKey)) {
        column.addEventListener('dragover', onDragOver);
        column.addEventListener('dragleave', onDragLeave);
        column.addEventListener('drop', onDrop);
      }

      // Cards
      const list = document.createElement('div');
      list.className = 'qp-card-list';

      // Cap visible cards per column at 50 (all columns, unless expanded)
      const SHOW_MAX = 50;
      var qpExpanded = window._qpExpandedCols || {};
      var isExpanded = qpExpanded[colKey];
      const showCards = (colTasks.length > SHOW_MAX && !isExpanded)
        ? colTasks.slice(0, SHOW_MAX) : colTasks;

      showCards.forEach(t => {
        const card = document.createElement('div');
        card.className = 'qp-card';
        if (selectedIds.has(t.id)) card.classList.add('qp-selected');
        card.dataset.taskId = t.id;

        if (newCompletedIds.includes(t.id)) {
          card.classList.add('qp-card-new');
          setTimeout(() => card.classList.remove('qp-card-new'), 2000);
        }

        // Make cards draggable if in an actionable column
        const actionableCols = ['pending', 'in_progress', 'waiting', 'deferred'];
        if (actionableCols.includes(colKey) && !batchMode) {
          card.draggable = true;
          card.addEventListener('dragstart', onDragStart);
          card.addEventListener('dragend', onDragEnd);
        }

        // Priority bar
        const priBar = document.createElement('div');
        priBar.className = 'qp-pri-bar ' + priorityClass(t.priority || 2);
        card.appendChild(priBar);

        // Card body
        const body = document.createElement('div');
        body.className = 'qp-card-body';

        const titleEl = document.createElement('div');
        titleEl.className = 'qp-card-title';
        titleEl.textContent = t.title;

        const meta = document.createElement('div');
        meta.className = 'qp-card-meta';

        const srcEl = document.createElement('span');
        srcEl.className = 'qp-card-source';
        srcEl.textContent = t.source || '—';

        const ageEl = document.createElement('span');
        ageEl.className = 'qp-card-age';
        ageEl.textContent = relativeTime(t.created_at);

        const priTag = document.createElement('span');
        priTag.className = 'qp-card-priority ' + priorityClass(t.priority || 2);
        priTag.textContent = PRIORITY_LABEL[t.priority] || 'normal';

        meta.appendChild(srcEl);
        meta.appendChild(priTag);
        meta.appendChild(ageEl);

        body.appendChild(titleEl);
        body.appendChild(meta);

        // Completed tasks: copy output file button
        if (colKey === 'completed' && t.output_file) {
          const copyBtn = document.createElement('button');
          copyBtn.className = 'qp-copy-btn';
          copyBtn.textContent = '📋';
          copyBtn.title = 'Copy output file path';
          copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(t.output_file).then(() => {
              const toast = document.createElement('div');
              toast.className = 'qp-toast';
              toast.textContent = 'copied';
              copyBtn.parentElement.appendChild(toast);
              setTimeout(() => toast.remove(), 1500);
            });
          });
          meta.appendChild(copyBtn);
        }

        // Inline actions (pending and waiting only)
        if ((colKey === 'pending' || colKey === 'waiting' || colKey === 'deferred') && !batchMode) {
          const actions = document.createElement('div');
          actions.className = 'qp-card-actions';
          if (colKey === 'pending') {
            actions.innerHTML = `<button class="qp-action-btn qp-act-claim" data-id="${t.id}">claim</button>
              <button class="qp-action-btn qp-act-defer" data-id="${t.id}">defer</button>`;
          } else if (colKey === 'waiting') {
            actions.innerHTML = `<button class="qp-action-btn qp-act-approve" data-id="${t.id}">approve</button>
              <button class="qp-action-btn qp-act-reject" data-id="${t.id}">reject</button>`;
          } else if (colKey === 'deferred') {
            actions.innerHTML = `<button class="qp-action-btn qp-act-claim" data-id="${t.id}">un-defer</button>`;
          }
          body.appendChild(actions);
        }

        // Batch checkbox
        if (batchMode) {
          const checkbox = document.createElement('div');
          checkbox.className = 'qp-batch-check';
          checkbox.textContent = selectedIds.has(t.id) ? '☑' : '☐';
          checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedIds.has(t.id)) selectedIds.delete(t.id);
            else selectedIds.add(t.id);
            reRender();
          });
          body.appendChild(checkbox);
        }

        card.appendChild(body);

        // Click to show detail (unless batch mode checkbox clicked)
        card.addEventListener('click', (e) => {
          if (e.target.closest('.qp-batch-check') || e.target.closest('.qp-action-btn')) return;
          showTaskDetail(t);
        });

        list.appendChild(card);
      });

      // "Show all N items" link for any column exceeding cap
      if (colTasks.length > SHOW_MAX && !isExpanded) {
        const moreBtn = document.createElement('div');
        moreBtn.style.cssText = 'text-align:center;padding:8px;cursor:pointer;color:var(--accent);font-size:10px';
        moreBtn.textContent = `Show all ${colTasks.length} ▾`;
        (function(colKey_local) {
          moreBtn.addEventListener('click', function () {
            var expanded = window._qpExpandedCols || {};
            expanded[colKey_local] = true;
            window._qpExpandedCols = expanded;
            reRender();
          });
        })(colKey);
        list.appendChild(moreBtn);
      }

      column.appendChild(list);
      board.appendChild(column);
    });

    // Batch action bar (floating bar at bottom when items selected)
    if (selectedIds.size > 0) {
      const bar = document.createElement('div');
      bar.className = 'qp-batch-bar';
      const count = document.createElement('span');
      count.className = 'qp-batch-count';
      count.textContent = selectedIds.size + ' selected';
      bar.appendChild(count);
      ['pending', 'cancelled', 'delete'].forEach(action => {
        const btn = document.createElement('button');
        btn.className = 'qp-batch-action-btn qp-batch-' + action;
        const labels = { pending: 'Set Pending', cancelled: 'Cancel', delete: 'Delete' };
        btn.textContent = labels[action];
        btn.dataset.batchAction = action;
        bar.appendChild(btn);
      });
      board.appendChild(bar);
    }

    return board;
  } catch (err) {
    console.error('buildBoard failed:', err);
    const fallback = document.createElement('div');
    fallback.className = 'error-fallback';
    fallback.innerHTML = '<span class="error-fallback-icon">⚠</span> Something went wrong loading the queue panel.';
    return fallback;
  }
}

/* ── Batch action handlers ────────────────── */

async function handleBatchAction(action) {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return;
  if (action === 'delete' && !confirm(`Delete ${ids.length} task${ids.length > 1 ? 's' : ''}?`)) return;
  const ok = await apiPost('/api/queue/batch', { ids, action });
  if (ok) {
    selectedIds.clear();
    batchMode = false;
    reRender();
  }
}

/* ── Inline action handlers ─────────────── */

async function handleClaim(taskId) {
  const ok = await apiPost('/api/queue/claim', { id: taskId });
  if (ok) reRender();
}

async function handleDefer(taskId) {
  const when = prompt('Defer until: today, tomorrow, or this_week?', 'tomorrow');
  if (!when) return;
  const ok = await apiPost('/api/queue/defer', { id: taskId, when: when.trim() });
  if (ok) reRender();
}

async function handleApprove(taskId) {
  const ok = await apiPost('/api/queue/approve', { id: taskId });
  if (ok) reRender();
}

async function handleReject(taskId) {
  if (!confirm('Reject this task?')) return;
  const ok = await apiPost('/api/queue/reject', { id: taskId });
  if (ok) reRender();
}

/* ── Drag-and-Drop ─────────────────────── */

let dragSource = null;
let dragSourceStatus = null;

function onDragStart(e) {
  dragSource = this;
  dragSourceStatus = this.closest('.qp-column')?.dataset?.status || null;
  this.classList.add('qp-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.taskId);
}
function onDragEnd() {
  this.classList.remove('qp-dragging');
  dragSource = null;
  dragSourceStatus = null;
  document.querySelectorAll('.qp-column.qp-drag-over').forEach(c => c.classList.remove('qp-drag-over'));
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.closest('.qp-column')?.classList.add('qp-drag-over');
}
function onDragLeave(e) {
  this.closest('.qp-column')?.classList.remove('qp-drag-over');
}
function onDrop(e) {
  e.preventDefault();
  const dropCol = this.closest('.qp-column');
  if (!dropCol || !dragSource) return;
  dropCol.classList.remove('qp-drag-over');

  const taskId = parseInt(dragSource.dataset.taskId, 10);
  const newStatus = dropCol.dataset.status;

  if (newStatus && dragSourceStatus && newStatus !== dragSourceStatus) {
    // Cross-column drop: update status via API
    apiPatch(taskId, { status: newStatus }).then(ok => {
      if (ok) reRender();
    });
  } else {
    // Same-column drop: reorder in DOM
    const list = dropCol.querySelector('.qp-card-list');
    if (!list) return;
    const insertAfter = getDropInsertPoint(dropCol, e.clientY);
    if (insertAfter) insertAfter.parentNode.insertBefore(dragSource, insertAfter.nextSibling);
    else list.appendChild(dragSource);
  }
}
function getDropInsertPoint(column, clientY) {
  const cards = column.querySelectorAll('.qp-card:not(.dragging)');
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return card.previousElementSibling;
  }
  return null;
}

/* ── Filters and Saved Views ──────────────── */

function buildFilterBar(container) {
  const bar = document.createElement('div');
  bar.className = 'qp-filter-bar';

  // Filter chips
  const filters = [
    { key: 'all', label: 'all' },
    { key: 'active', label: 'active' },
    { key: 'done', label: 'done' },
    { key: 'deferred', label: 'deferred' },
  ];
  const chipGroup = document.createElement('div');
  chipGroup.className = 'qp-filter-chips';
  filters.forEach(f => {
    const chip = document.createElement('span');
    chip.className = 'qp-filter-chip' + (currentFilter === f.key ? ' active' : '');
    chip.textContent = f.label;
    chip.addEventListener('click', () => {
      currentFilter = f.key;
      reRender();
    });
    chipGroup.appendChild(chip);
  });
  bar.appendChild(chipGroup);

  // Saved views
  const views = loadSavedViews();
  if (views.length > 0) {
    const viewGroup = document.createElement('div');
    viewGroup.className = 'qp-saved-views';
    views.forEach((v, i) => {
      const chip = document.createElement('span');
      chip.className = 'qp-view-chip';
      chip.textContent = '★ ' + v.name;
      chip.title = v.filter;
      chip.addEventListener('click', () => {
        currentFilter = v.filter;
        reRender();
      });
      viewGroup.appendChild(chip);
    });
    bar.appendChild(viewGroup);
  }

  // Save view button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'qp-save-view-btn';
  saveBtn.textContent = '★ save view';
  saveBtn.addEventListener('click', () => {
    const name = prompt('Name this view:', 'my view');
    if (!name) return;
    const views = loadSavedViews();
    views.push({ name, filter: currentFilter });
    saveSavedViews(views);
    reRender();
  });
  bar.appendChild(saveBtn);

  container.prepend(bar);
}

/* ── Task Templates ────────────────────────── */

function buildTemplatesBar(container) {
  fetchTemplates().then(data => {
    try {
      if (!data || !data.templates || data.templates.length === 0) return;
      const bar = document.createElement('div');
      bar.className = 'qp-templates-bar';
      const label = document.createElement('span');
      label.className = 'qp-templates-label';
      label.textContent = '◆ templates';
      bar.appendChild(label);
      data.templates.forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'qp-template-btn';
        btn.textContent = t.name;
        btn.title = t.goal || '';
        btn.addEventListener('click', async () => {
          try {
            const ok = await apiPost('/api/queue', {
              title: t.name,
              goal: t.goal || t.name,
              context: t.context || '',
              priority: t.priority || 2,
            });
            if (ok) reRender();
          } catch (err) {
            console.error('buildTemplatesBar template click failed:', err);
          }
        });
        bar.appendChild(btn);
      });
      container.prepend(bar);
    } catch (err) {
      console.error('buildTemplatesBar rendering failed:', err);
    }
  });
}

/* ── Backlog Graph ─────────────────────────── */

function buildBacklogGraph(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'qp-backlog-wrap';

  const header = document.createElement('div');
  header.className = 'qp-backlog-header';
  header.innerHTML = '<span>▤ backlog (7 days)</span>';
  wrapper.appendChild(header);

  const canvas = document.createElement('canvas');
  canvas.className = 'qp-backlog-canvas';
  canvas.width = 400;
  canvas.height = 80;
  wrapper.appendChild(canvas);
  container.prepend(wrapper);

  // Render chart from history data
  fetchHistory().then(hist => {
    try {
      if (!hist) return;
      const ctx = canvas.getContext('2d');
      const completed = hist.completed || [];
      // Group by day
      const dayBuckets = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dayBuckets[key] = 0;
      }
      completed.forEach(t => {
        if (t.completed_at) {
          const key = new Date(t.completed_at).toISOString().split('T')[0];
          if (key in dayBuckets) dayBuckets[key]++;
        }
      });

      const days = Object.keys(dayBuckets);
      const vals = Object.values(dayBuckets);
      const max = Math.max(...vals, 1);

      // Bar chart
      const dw = canvas.width / days.length;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,204,102,0.6)';
      vals.forEach((v, i) => {
        const h = (v / max) * (canvas.height - 4);
        ctx.fillRect(i * dw + 1, canvas.height - h - 2, dw - 2, h);
      });
      // Trend line
      if (vals.length >= 2) {
        ctx.strokeStyle = '#6699ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        vals.forEach((v, i) => {
          const x = i * dw + dw / 2;
          const y = canvas.height - ((v / max) * (canvas.height - 4)) - 2;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    } catch (err) {
      console.error('buildBacklogGraph render failed:', err);
    }
  });
}

/* ── Add Task Form ─────────────────────── */

function showAddForm() {
  const existing = document.querySelector('.qp-add-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'qp-add-overlay';
  const form = document.createElement('div');
  form.className = 'qp-add-form';
  form.innerHTML = `
    <div class="qp-add-header">
      <span>add task</span>
      <button class="qp-close-btn">✕</button>
    </div>
    <label>
      <span class="qp-field-label">title</span>
      <input type="text" id="qp-form-title" placeholder="Short task title" spellcheck="false">
    </label>
    <label>
      <span class="qp-field-label">goal</span>
      <textarea id="qp-form-goal" rows="3" placeholder="What should the executor do?"></textarea>
    </label>
    <label>
      <span class="qp-field-label">context</span>
      <textarea id="qp-form-context" rows="3" placeholder="Background info, constraints, references"></textarea>
    </label>
    <label>
      <span class="qp-field-label">priority</span>
      <select id="qp-form-priority">
        <option value="1">1 — lowest</option>
        <option value="2" selected>2 — normal</option>
        <option value="3">3 — high</option>
        <option value="4">4 — critical</option>
        <option value="5">5 — emergency</option>
      </select>
    </label>
    <label>
      <span class="qp-field-label">source</span>
      <select id="qp-form-source">
        <option value="chat">chat</option>
        <option value="sprint-plan">sprint-plan</option>
        <option value="agent">agent</option>
        <option value="email">email</option>
        <option value="other">other</option>
      </select>
    </label>
    <button class="qp-submit-btn">submit to queue</button>
  `;

  overlay.appendChild(form);
  document.body.appendChild(overlay);

  form.querySelector('.qp-close-btn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  form.querySelector('.qp-submit-btn').addEventListener('click', async () => {
    const title = document.getElementById('qp-form-title').value.trim();
    if (!title) { document.getElementById('qp-form-title').focus(); return; }
    const taskData = {
      title,
      goal: document.getElementById('qp-form-goal').value.trim(),
      context: document.getElementById('qp-form-context').value.trim(),
      priority: parseInt(document.getElementById('qp-form-priority').value, 10),
      source: document.getElementById('qp-form-source').value,
    };
    const ok = await apiPost('/api/queue', taskData);
    overlay.remove();
    if (ok) reRender();
  });
}

/* ── Task Detail Overlay ────────────────── */

function showTaskDetail(task) {
  const existing = document.querySelector('.qp-detail-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'qp-detail-overlay';
  const detail = document.createElement('div');
  detail.className = 'qp-detail';
  const priLabel = PRIORITY_LABEL[task.priority] || 'normal';

  const priorityOptions = [1,2,3,4,5].map(p =>
    `<option value="${p}"${p === task.priority ? ' selected' : ''}>${p} — ${PRIORITY_LABEL[p]}</option>`
  ).join('');

  detail.innerHTML = `
    <div class="qp-detail-header">
      <button class="qp-detail-close">✕</button>
      <span class="qp-detail-title" contenteditable="true" id="qp-detail-title-input">${escapeHtml(task.title)}</span>
      <span class="qp-detail-status ${task.status}">${task.status.replace('_', ' ')}</span>
    </div>

    <div class="qp-detail-section">
      <div class="qp-detail-section-title">metadata</div>
      <div class="qp-detail-meta">
        <div><span class="qp-detail-label">id</span> ${task.id}</div>
        <div><span class="qp-detail-label">priority</span>
          <select id="qp-detail-priority-select" class="qp-detail-select">${priorityOptions}</select>
        </div>
        <div><span class="qp-detail-label">source</span> ${escapeHtml(task.source || '—')}</div>
        <div><span class="qp-detail-label">created</span> ${new Date(task.created_at).toLocaleString()}</div>
        ${task.completed_at ? `<div><span class="qp-detail-label">completed</span> ${new Date(task.completed_at).toLocaleString()}</div>` : ''}
      </div>
    </div>

    <div class="qp-detail-section">
      <div class="qp-detail-section-title">goal</div>
      <textarea id="qp-detail-goal-input" class="qp-detail-textarea" rows="3">${escapeHtml(task.goal || '')}</textarea>
    </div>

    ${task.context ? `
    <div class="qp-detail-section">
      <div class="qp-detail-section-title">context</div>
      <div class="qp-detail-context">${escapeHtml(task.context)}</div>
    </div>` : ''}

    ${task.output ? `
    <div class="qp-detail-section">
      <div class="qp-detail-section-title">output</div>
      <pre class="qp-detail-output">${escapeHtml(task.output)}</pre>
    </div>` : ''}

    <div class="qp-detail-actions">
      <button class="qp-action-btn qp-act-save" data-id="${task.id}">save</button>
      ${task.status === 'pending' ? `
        <button class="qp-action-btn qp-act-claim" data-id="${task.id}">claim</button>
        <button class="qp-action-btn qp-act-defer" data-id="${task.id}">defer to tomorrow</button>
      ` : ''}
      ${task.status === 'waiting' ? `
        <button class="qp-action-btn qp-act-approve" data-id="${task.id}">approve</button>
        <button class="qp-action-btn qp-act-reject" data-id="${task.id}">reject</button>
      ` : ''}
      ${task.status === 'in_progress' ? `
        <span class="qp-detail-status-msg">running — let the executor handle this</span>
      ` : ''}
    </div>
  `;

  overlay.appendChild(detail);
  document.body.appendChild(overlay);

  detail.querySelector('.qp-detail-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Wire action buttons in detail
  detail.querySelectorAll('.qp-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id, 10);

      if (btn.classList.contains('qp-act-save')) {
        const titleInput = detail.querySelector('#qp-detail-title-input');
        const goalInput = detail.querySelector('#qp-detail-goal-input');
        const prioritySelect = detail.querySelector('#qp-detail-priority-select');
        const newTitle = titleInput.textContent.trim();
        const newGoal = goalInput.value.trim();
        const newPriority = parseInt(prioritySelect.value, 10);
        if (!newTitle) return;
        const ok = await apiPatch(id, { title: newTitle, goal: newGoal, priority: newPriority });
        if (ok) { overlay.remove(); reRender(); }
        return;
      }

      if (btn.classList.contains('qp-act-claim')) await handleClaim(id);
      else if (btn.classList.contains('qp-act-defer')) await handleDefer(id);
      else if (btn.classList.contains('qp-act-approve')) await handleApprove(id);
      else if (btn.classList.contains('qp-act-reject')) await handleReject(id);
      overlay.remove();
    });
  });

  // Focus title on open
  requestAnimationFrame(() => {
    const titleEl = detail.querySelector('#qp-detail-title-input');
    if (titleEl) titleEl.focus();
  });
}

/* ── Mark completed tracking ────────────── */

function markNewCompleted(tasks) {
  const completed = tasks.filter(t => t.status === 'completed');
  const nowIds = new Set(completed.map(t => t.id));
  const newIds = [...nowIds].filter(id => !knownCompletedIds.has(id));
  knownCompletedIds = nowIds;
  return newIds;
}

/* ── Re-render (reuse cached data) ──────── */

function reRender() {
  try {
    const container = document.querySelector('#queue-summary');
    if (!container || !tasksCache) return;
    const board = buildBoard(tasksCache.tasks);
    container.innerHTML = '';
    // Rebuild toolbar that was outside the board
    buildQueueToolbar(container);
    container.appendChild(board);
  } catch (err) {
    console.error('reRender failed:', err);
    const container = document.querySelector('#queue-summary');
    if (container) {
      container.innerHTML = inlineStyles() + '<div class="error-fallback"><span class="error-fallback-icon">⚠</span> Something went wrong loading the queue panel.</div>';
    }
  }
}

/* ── Freshness ticker ──────────────────── */

function fmtFresh() {
  if (!_queueFetchTime) return '';
  const secs = Math.floor((Date.now() - _queueFetchTime) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return secs + 's ago';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

function startFreshTicker() {
  const tsEl = document.querySelector('#qp-fresh-ts');
  if (!tsEl) return;
  tsEl.textContent = 'Synced ' + fmtFresh();
  if (_freshTicker) clearInterval(_freshTicker);
  _freshTicker = setInterval(() => {
    const el = document.querySelector('#qp-fresh-ts');
    if (el) el.textContent = 'Synced ' + fmtFresh();
  }, 30000);
}

/* ── Toolbar (filters + templates + graph) ── */

function buildQueueToolbar(container) {
  const toolbar = document.createElement('div');
  toolbar.className = 'qp-toolbar';
  // Add freshness indicator at the top of the toolbar
  const freshRow = document.createElement('div');
  freshRow.className = 'qp-fresh-row';
  freshRow.innerHTML = '<span class="qp-fresh-label" id="qp-fresh-ts">Synced —</span>';
  toolbar.appendChild(freshRow);
  container.appendChild(toolbar);
  buildFilterBar(toolbar);
  buildTemplatesBar(toolbar);
  buildBacklogGraph(toolbar);
}

/* ── Render Entry Point ────────────────── */

export async function renderQueue(container) {
  try {
    container.innerHTML = '';

    if (!tasksCache) {
      container.innerHTML = '<div class="empty-state"><div class="big-icon">◈</div>Loading task queue…</div>';
      tasksCache = await fetchTasks();
      if (tasksCache) _queueFetchTime = Date.now();
    }

    if (!tasksCache || !tasksCache.tasks || tasksCache.tasks.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="big-icon">◈</div>No tasks — queue is empty</div>' + inlineStyles();
      return;
    }

    const styleEl = document.createElement('style');
    styleEl.textContent = inlineStyles();
    document.head.appendChild(styleEl);

    buildQueueToolbar(container);

    const board = buildBoard(tasksCache.tasks);
    container.appendChild(board);

    // Start freshness ticker
    startFreshTicker();

    // Wire event delegation for inline action buttons
    container.addEventListener('click', (e) => {
      try {
        const btn = e.target.closest('.qp-action-btn');
        if (btn) {
          const id = parseInt(btn.dataset.id, 10);
          if (btn.classList.contains('qp-act-claim')) handleClaim(id);
          else if (btn.classList.contains('qp-act-defer')) handleDefer(id);
          else if (btn.classList.contains('qp-act-approve')) handleApprove(id);
          else if (btn.classList.contains('qp-act-reject')) handleReject(id);
          return;
        }
        // Batch action buttons
        const batchBtn = e.target.closest('.qp-batch-action-btn');
        if (batchBtn && batchBtn.dataset.batchAction) {
          handleBatchAction(batchBtn.dataset.batchAction);
        }
      } catch (err) {
        console.error('Queue action handler failed:', err);
      }
    });

    // Refresh every 15s
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(async () => {
      const data = await fetchTasks();
      if (data && data.tasks) {
        tasksCache = data;
        _queueFetchTime = Date.now();
        reRender();
      }
    }, 15000);
  } catch (err) {
    console.error('renderQueue failed:', err);
    container.innerHTML = inlineStyles() + '<div class="error-fallback"><span class="error-fallback-icon">⚠</span> Something went wrong loading the queue panel.</div>';
  }
}

/* ── Inline CSS ────────────────────────── */

function inlineStyles() {
  return `
.qp-board {
  display: grid;
  gap: 16px;
  min-height: 300px;
  align-items: start;
}
.qp-column {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  min-height: 150px;
}
.qp-col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.qp-col-title {
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--fg-dim);
}
.qp-col-count {
  font-size: 10px; color: var(--fg-dim);
  background: var(--bg); padding: 2px 7px; border-radius: 8px;
}
.qp-batch-toggle {
  cursor: pointer; font-size: 14px; color: var(--fg-dim);
  margin-left: auto; padding: 0 4px;
}
.qp-batch-toggle:hover { color: var(--accent); }
.qp-add-btn {
  margin: 8px 14px; padding: 5px 12px;
  background: transparent; border: 1px dashed var(--border-light);
  border-radius: 4px; color: var(--fg-dim);
  font-family: var(--font-mono); font-size: 11px; cursor: pointer;
  transition: all 0.15s;
}
.qp-add-btn:hover { border-color: var(--accent); color: var(--accent); background: rgba(0,204,102,0.05); }
.qp-card-list { flex: 1; padding: 0 14px 14px; display: flex; flex-direction: column; gap: 6px; }
.qp-card {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; cursor: pointer;
  display: flex; gap: 0; overflow: hidden;
  transition: border-color 0.15s, transform 0.1s;
  position: relative;
}
.qp-card:hover { border-color: var(--border-light); transform: translateY(-1px); }
.qp-card.qp-selected { border-color: var(--accent); box-shadow: 0 0 4px rgba(0,204,102,0.3); }
.qp-card[draggable="true"] { cursor: grab; }
.qp-card[draggable="true"]:active { cursor: grabbing; }
.qp-card.qp-dragging { opacity: 0.4; border-style: dashed; }
.qp-column.qp-drag-over { background: var(--bg-alt); outline: 2px dashed var(--accent-dim); outline-offset: -2px; }
.qp-card.qp-card-new { animation: qp-flash 2s ease-out; }
@keyframes qp-flash {
  0% { border-color: var(--accent); box-shadow: 0 0 8px rgba(0,204,102,0.3); }
  100% { border-color: var(--border); box-shadow: none; }
}
.qp-pri-bar { width: 4px; flex-shrink: 0; }
.qp-pri-critical { background: var(--danger); }
.qp-pri-high     { background: var(--accent); }
.qp-pri-normal   { background: var(--warn); }
.qp-pri-low      { background: var(--fg-dim); }
.qp-pri-lowest   { background: #444; }
.qp-card-body {
  flex: 1; padding: 8px 10px;
  display: flex; flex-direction: column; gap: 3px; min-width: 0;
}
.qp-card-title { font-size: 12px; color: var(--fg); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qp-card-meta { display: flex; gap: 8px; font-size: 9px; color: var(--fg-dim); align-items: center; flex-wrap: wrap; }
.qp-card-source { color: var(--fg-alt); }
.qp-card-age { color: var(--fg-dim); }
.qp-card-priority { font-size: 8px; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.3px; }
.qp-card-priority.qp-pri-critical { color: var(--danger); border: 1px solid rgba(204,51,51,0.3); }
.qp-card-priority.qp-pri-high     { color: var(--accent); border: 1px solid rgba(0,204,102,0.3); }
.qp-card-priority.qp-pri-normal   { color: var(--warn);   border: 1px solid rgba(204,170,0,0.3); }
.qp-card-priority.qp-pri-low      { color: var(--fg-alt); border: 1px solid rgba(128,128,128,0.2); }
.qp-card-priority.qp-pri-lowest   { color: #666; border: 1px solid rgba(100,100,100,0.2); }

/* Inline action buttons */
.qp-card-actions {
  display: flex; gap: 4px; margin-top: 4px;
}
.qp-action-btn {
  padding: 2px 8px; font-size: 9px; font-family: var(--font-mono);
  border-radius: 3px; border: 1px solid var(--border);
  background: transparent; color: var(--fg-dim);
  cursor: pointer; transition: all 0.15s;
}
.qp-action-btn:hover { border-color: var(--border-light); color: var(--fg); }
.qp-act-claim:hover { border-color: var(--accent-dim); color: var(--accent); }
.qp-act-defer:hover { border-color: var(--warn); color: var(--warn); }
.qp-act-approve:hover { border-color: var(--accent-dim); color: var(--accent); }
.qp-act-reject:hover { border-color: var(--danger); color: var(--danger); }

/* Batch checkbox */
.qp-batch-check {
  position: absolute; top: 4px; right: 4px;
  font-size: 16px; cursor: pointer; color: var(--fg-dim);
  width: 20px; height: 20px; display: flex;
  align-items: center; justify-content: center;
}
.qp-batch-check:hover { color: var(--accent); }

/* Batch action bar */
.qp-batch-bar {
  position: sticky; bottom: 0;
  background: var(--bg-alt); border-top: 1px solid var(--border);
  padding: 8px 14px; display: flex;
  align-items: center; gap: 8px;
  margin-top: -1px; z-index: 5;
}
.qp-batch-count {
  font-size: 10px; color: var(--fg-dim);
  margin-right: auto; text-transform: lowercase;
}
.qp-batch-action-btn {
  padding: 4px 12px; font-size: 10px; font-family: var(--font-mono);
  border-radius: 4px; border: 1px solid var(--border);
  background: transparent; color: var(--fg-dim); cursor: pointer;
  transition: all 0.15s;
}
.qp-batch-action-btn:hover { border-color: var(--border-light); color: var(--fg); }
.qp-batch-pending:hover { border-color: var(--accent-dim); color: var(--accent); }
.qp-batch-cancelled:hover { border-color: var(--warn); color: var(--warn); }
.qp-batch-delete:hover { border-color: var(--danger); color: var(--danger); }

/* Detail actions */
.qp-detail-actions { display: flex; gap: 8px; margin-top: 12px; }
.qp-detail-status-msg { font-size: 10px; color: var(--fg-dim); font-style: italic; }

/* Toolbar */
.qp-toolbar { margin-bottom: 12px; }

/* Filter bar */
.qp-filter-bar {
  display: flex; align-items: center; gap: 8px;
  flex-wrap: wrap; margin-bottom: 8px;
}
.qp-filter-chips { display: flex; gap: 2px; }
.qp-filter-chip {
  padding: 3px 10px; font-size: 10px; border-radius: 4px;
  cursor: pointer; color: var(--fg-dim);
  font-family: var(--font-mono); transition: all 0.15s;
  text-transform: lowercase;
}
.qp-filter-chip:hover { color: var(--fg); background: var(--bg-panel); }
.qp-filter-chip.active { color: var(--accent); background: rgba(0,204,102,0.1); }
.qp-saved-views { display: flex; gap: 2px; }
.qp-view-chip {
  padding: 3px 8px; font-size: 9px; border-radius: 4px;
  cursor: pointer; color: var(--warn);
  font-family: var(--font-mono); transition: all 0.15s;
  background: rgba(204,170,0,0.08);
}
.qp-view-chip:hover { background: rgba(204,170,0,0.15); }
.qp-save-view-btn {
  padding: 3px 8px; font-size: 9px; border-radius: 4px;
  border: 1px solid var(--border); background: transparent;
  color: var(--fg-dim); cursor: pointer;
  font-family: var(--font-mono); margin-left: auto;
}
.qp-save-view-btn:hover { border-color: var(--warn); color: var(--warn); }

/* Templates bar */
.qp-templates-bar {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 8px; flex-wrap: wrap;
}
.qp-templates-label {
  font-size: 9px; color: var(--fg-dim);
  text-transform: lowercase; letter-spacing: 0.3px;
  margin-right: 4px;
}
.qp-template-btn {
  padding: 3px 10px; font-size: 9px; border-radius: 4px;
  border: 1px solid var(--border); background: var(--bg-panel);
  color: var(--accent); cursor: pointer;
  font-family: var(--font-mono); transition: all 0.15s;
}
.qp-template-btn:hover { border-color: var(--accent-dim); background: rgba(0,204,102,0.08); }

/* Backlog graph */
.qp-backlog-wrap { margin-bottom: 8px; }
.qp-backlog-header {
  font-size: 9px; color: var(--fg-dim);
  text-transform: lowercase; letter-spacing: 0.3px;
  padding-bottom: 4px;
}
.qp-backlog-canvas {
  width: 100%; height: 60px;
  border: 1px solid var(--border); border-radius: 4px;
  background: var(--bg);
}

/* Add task overlay */
.qp-add-overlay {
  position: fixed; top:0; left:0; right:0; bottom:0;
  background: rgba(0,0,0,0.6); z-index: 110;
  display: flex; align-items: center; justify-content: center;
}
.qp-add-form {
  width: 480px; max-width: 90vw;
  background: var(--bg-alt); border: 1px solid var(--border);
  border-radius: 6px; padding: 20px;
  display: flex; flex-direction: column; gap: 14px;
}
.qp-add-header {
  display: flex; justify-content: space-between;
  align-items: center; font-size: 13px; color: var(--fg);
  text-transform: lowercase;
}
.qp-close-btn {
  background: none; border: 1px solid var(--border);
  border-radius: 4px; color: var(--fg-dim);
  cursor: pointer; font-size: 14px; padding: 4px 8px;
  font-family: var(--font-mono);
}
.qp-close-btn:hover { border-color: var(--fg-dim); color: var(--fg); }
.qp-add-form label { display: flex; flex-direction: column; gap: 4px; }
.qp-field-label { font-size: 10px; color: var(--fg-dim); text-transform: uppercase; letter-spacing: 0.3px; }
.qp-add-form input,
.qp-add-form textarea,
.qp-add-form select {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 8px 10px;
  font-family: var(--font-mono); font-size: 12px;
  color: var(--fg); outline: none;
}
.qp-add-form input:focus,
.qp-add-form textarea:focus,
.qp-add-form select:focus { border-color: var(--accent); }
.qp-add-form textarea { resize: vertical; }
.qp-submit-btn {
  padding: 8px 16px; background: var(--accent-dim);
  border: 1px solid var(--accent); border-radius: 4px;
  color: var(--fg); font-family: var(--font-mono);
  font-size: 12px; cursor: pointer;
  transition: background 0.15s; align-self: flex-end;
}
.qp-submit-btn:hover { background: var(--accent); color: #000; }

/* Task detail overlay */
.qp-detail-overlay {
  position: fixed; top:0; left:0; right:0; bottom:0;
  background: rgba(0,0,0,0.6); z-index: 100;
  display: flex; justify-content: flex-end;
}
.qp-detail {
  width: 420px; max-width: 90vw;
  background: var(--bg-alt); border-left: 1px solid var(--border);
  height: 100%; overflow-y: auto; padding: 20px;
  animation: qp-slideIn 0.15s ease-out;
}
@keyframes qp-slideIn {
  from { transform: translateX(30px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
.qp-detail-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.qp-detail-close {
  background: none; border: 1px solid var(--border);
  border-radius: 4px; color: var(--fg-dim);
  cursor: pointer; font-size: 14px; padding: 4px 8px;
  font-family: var(--font-mono);
}
.qp-detail-close:hover { border-color: var(--fg-dim); color: var(--fg); }
.qp-detail-title { font-size: 14px; font-weight: 600; color: var(--fg); flex: 1; }
.qp-detail-status { font-size: 9px; padding: 2px 7px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.3px; border: 1px solid; }
.qp-detail-status.pending     { color: var(--warn);    border-color: rgba(204,170,0,0.3); }
.qp-detail-status.in_progress { color: var(--accent);  border-color: rgba(0,204,102,0.3); }
.qp-detail-status.completed   { color: var(--fg-dim);  border-color: rgba(128,128,128,0.2); }
.qp-detail-status.failed      { color: var(--danger);  border-color: rgba(204,51,51,0.3); }
.qp-detail-status.cancelled   { color: var(--fg-alt);  border-color: rgba(128,128,128,0.2); }
.qp-detail-status.waiting     { color: var(--fg-alt);  border-color: rgba(128,128,128,0.2); }
.qp-detail-status.deferred    { color: var(--warn);    border-color: rgba(204,170,0,0.3); }
.qp-detail-section { margin-bottom: 16px; }
.qp-detail-section-title {
  font-size: 9px; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--fg-dim);
  margin-bottom: 6px;
}
.qp-detail-meta { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--fg); }
.qp-detail-label { color: var(--fg-dim); display: inline-block; width: 60px; flex-shrink: 0; }
.qp-detail-meta > div { display: flex; align-items: center; }
.qp-detail-goal, .qp-detail-context {
  font-size: 11px; color: var(--fg);
  line-height: 1.5; white-space: pre-wrap; word-break: break-word;
}
.qp-detail-output {
  font-size: 10px; color: var(--fg); line-height: 1.5;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 10px;
  overflow-x: auto; white-space: pre-wrap;
  word-break: break-word; max-height: 400px; overflow-y: auto;
}
.qp-detail-select {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--fg);
  font-size: 11px;
  font-family: var(--font-mono);
  padding: 2px 4px;
  cursor: pointer;
  width: auto;
}
.qp-detail-select:focus {
  border-color: var(--accent);
  outline: none;
}
.qp-detail-textarea {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--fg);
  font-size: 11px;
  font-family: inherit;
  line-height: 1.5;
  padding: 6px 8px;
  resize: vertical;
  box-sizing: border-box;
}
.qp-detail-textarea:focus {
  border-color: var(--accent);
  outline: none;
}
.qp-detail-title[contenteditable] {
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 2px 4px;
  cursor: text;
  outline: none;
  min-width: 50px;
}
.qp-detail-title[contenteditable]:focus {
  border-color: var(--accent);
  background: var(--bg);
}
.qp-act-save {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}
.qp-act-save:hover {
  opacity: 0.85;
}
.qp-column .empty-state { padding: 20px; text-align: center; color: var(--fg-dim); font-size: 11px; }
.qp-copy-btn { background:none; border:none; cursor:pointer; font-size:11px; padding:1px 4px; margin-left:4px; opacity:0.5; transition:opacity 0.15s; line-height:1; vertical-align:middle; }
.qp-copy-btn:hover { opacity:1; }
.qp-toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--bg-panel); border:1px solid var(--accent); color:var(--accent); padding:4px 14px; border-radius:4px; font-size:10px; z-index:200; animation:toastIn 0.15s ease-out; }
@keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

/* Error fallback */
.error-fallback {
  padding: 40px 20px;
  text-align: center;
  color: var(--fg-dim);
  font-family: var(--font-mono);
  font-size: 13px;
}
.error-fallback-icon {
  display: block;
  font-size: 32px;
  margin-bottom: 12px;
}

/* Freshness row */
.qp-fresh-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 6px;
}
.qp-fresh-label {
  font-size: 9px;
  color: var(--fg-dim);
  font-family: var(--font-mono);
  letter-spacing: 0.3px;
  opacity: 0.7;
}
`;
}
