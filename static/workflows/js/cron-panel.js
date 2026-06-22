/**
 * grainworks Cron Dashboard v0.1
 * Card grid showing all active cron jobs with status dots, schedule, timestamps, Run Now.
 * Polls data/cron-status.json every 10s. Zero dependencies. ES6 module.
 *
 * Import: import { renderCronDashboard } from './js/cron-panel.js';
 */

import { relativeTime } from './shared-utils.js';

/* ── State ─────────────────────────────────── */
let refreshInterval = null;
let activeFilter = 'all';

/**
 * Fetch cron-status.json with cache-busting.
 */
async function fetchCronStatus() {
  try {
    const resp = await fetch('./data/cron-status.json?_=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch {
    return null;
  }
}



/**
 * CSS class and label for status dot.
 */
function statusMeta(s) {
  switch (s) {
    case 'healthy':    return { cls: 'cd-dot-green', label: 'healthy' };
    case 'failing':    return { cls: 'cd-dot-red',   label: 'failing' };
    case 'never_run':  return { cls: 'cd-dot-yellow', label: 'never run' };
    case 'disabled':   return { cls: 'cd-dot-grey',  label: 'disabled' };
    default:           return { cls: 'cd-dot-grey',  label: s || 'unknown' };
  }
}

/**
 * Check if a job passes the current filter.
 */
function matchesFilter(job) {
  switch (activeFilter) {
    case 'healthy':   return job.status === 'healthy';
    case 'failing':   return job.status === 'failing';
    case 'never_run': return job.status === 'never_run' || job.status === 'disabled';
    case 'all':
    default:          return true;
  }
}

/**
 * Build the filter bar DOM.
 */
function buildFilterBar(counts) {
  const bar = document.createElement('div');
  bar.className = 'cd-filter-bar';

  const filters = [
    { key: 'all',       label: 'All',          count: counts.all },
    { key: 'healthy',   label: 'Healthy',       count: counts.healthy },
    { key: 'failing',   label: 'Failing',       count: counts.failing },
    { key: 'never_run', label: 'Never-run',     count: counts.never_run },
  ];

  filters.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'cd-filter-btn' + (f.key === activeFilter ? ' active' : '');
    btn.dataset.filter = f.key;
    btn.innerHTML = `${f.label} <span class="cd-filter-count">${f.count}</span>`;
    btn.addEventListener('click', () => {
      activeFilter = f.key;
      reRender();
    });
    bar.appendChild(btn);
  });

  return bar;
}

/**
 * Toggle cron job pause/resume state.
 */
async function toggleJobState(job, btn, dot, strip) {
  const isDisabled = job.status === 'disabled';
  const endpoint = isDisabled ? 'resume' : 'pause';
  const url = '/api/cron/' + endpoint + '/' + encodeURIComponent(job.name);

  btn.disabled = true;
  btn.textContent = isDisabled ? '◌ resuming…' : '◌ pausing…';

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Accept': 'application/json' }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    // Flip status
    job.status = isDisabled ? 'healthy' : 'disabled';
    const meta = statusMeta(job.status);
    dot.className = 'cd-dot ' + meta.cls;
    dot.title = meta.label;
    strip.className = 'cd-card-strip ' + meta.cls;
    btn.textContent = isDisabled ? '⏸ Pause' : '▶ Resume';
    btn.title = isDisabled ? 'Pause ' + job.name : 'Resume ' + job.name;
    btn.disabled = false;
  } catch (err) {
    btn.textContent = isDisabled ? '▶ Resume' : '⏸ Pause';
    btn.disabled = false;
    const errEl = btn.parentElement.querySelector('.cd-toggle-err');
    if (errEl) {
      errEl.textContent = '✗ ' + err.message;
      errEl.style.display = 'inline';
      setTimeout(() => { errEl.style.display = 'none'; }, 5000);
    }
  }
}

/**
 * Build the card grid DOM.
 */
function buildGrid(jobs) {
  const grid = document.createElement('div');
  grid.className = 'cd-grid';

  const filtered = jobs.filter(matchesFilter);

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.cssText = 'grid-column: 1 / -1; padding: 40px; text-align: center;';
    empty.innerHTML = '<div class="big-icon">◉</div><div style="margin-top: 8px; font-size: 11px; color: var(--fg-dim);">No jobs match this filter</div>';
    grid.appendChild(empty);
    return grid;
  }

  filtered.forEach(job => {
    const meta = statusMeta(job.status);
    const card = document.createElement('div');
    card.className = 'cd-card';

    // Status strip on left
    const strip = document.createElement('div');
    strip.className = 'cd-card-strip ' + meta.cls;
    card.appendChild(strip);

    // Body
    const body = document.createElement('div');
    body.className = 'cd-card-body';

    // Header row: dot + name + Run Now + Pause/Resume
    const header = document.createElement('div');
    header.className = 'cd-card-header';

    const dot = document.createElement('span');
    dot.className = 'cd-dot ' + meta.cls;
    dot.title = meta.label;
    header.appendChild(dot);

    const nameEl = document.createElement('span');
    nameEl.className = 'cd-job-name';
    nameEl.textContent = job.name;
    header.appendChild(nameEl);

    // Pause/Resume toggle button
    const isDisabled = job.status === 'disabled';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'cd-toggle-btn';
    toggleBtn.textContent = isDisabled ? '▶ Resume' : '⏸ Pause';
    toggleBtn.title = isDisabled ? 'Resume ' + job.name : 'Pause ' + job.name;
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (toggleBtn.disabled) return;
      toggleJobState(job, toggleBtn, dot, strip);
    });
    header.appendChild(toggleBtn);

    // Toggle error element
    const toggleErr = document.createElement('span');
    toggleErr.className = 'cd-toggle-err';
    toggleErr.style.display = 'none';
    header.appendChild(toggleErr);

    const runBtn = document.createElement('button');
    runBtn.className = 'cd-run-btn';
    runBtn.textContent = '▶ Run Now';
    runBtn.title = 'Trigger ' + job.name;

    const errorEl = document.createElement('span');
    errorEl.className = 'cd-run-error';
    errorEl.style.display = 'none';

    runBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (runBtn.disabled) return;
      runBtn.disabled = true;
      runBtn.textContent = '◌ running…';
      errorEl.style.display = 'none';

      try {
        const resp = await fetch('/api/cron/run/' + encodeURIComponent(job.name), {
          method: 'POST',
          headers: { 'Accept': 'application/json' }
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const result = await resp.json();
        // On success: update last_run if returned
        runBtn.textContent = '✓ triggered';
        if (result.last_run) {
          job.last_run = result.last_run;
          const lastVal = card.querySelector('.cd-detail-val');
          if (lastVal) lastVal.textContent = relativeTime(result.last_run);
        }
        setTimeout(() => {
          runBtn.textContent = '▶ Run Now';
          runBtn.disabled = false;
        }, 3000);
      } catch (err) {
        runBtn.textContent = '▶ Run Now';
        runBtn.disabled = false;
        errorEl.textContent = '✗ ' + err.message;
        errorEl.style.display = 'inline';
      }
    });
    header.appendChild(runBtn);
    header.appendChild(errorEl);

    body.appendChild(header);

    // Schedule
    const schedEl = document.createElement('div');
    schedEl.className = 'cd-card-sched';
    schedEl.textContent = job.schedule;
    body.appendChild(schedEl);

    // Detail grid: last-run, next-run, duration
    const details = document.createElement('div');
    details.className = 'cd-card-details';

    const lastEl = document.createElement('div');
    lastEl.className = 'cd-card-detail';
    lastEl.innerHTML = `<span class="cd-detail-label">last run</span><span class="cd-detail-val">${relativeTime(job.last_run)}</span>`;

    const nextEl = document.createElement('div');
    nextEl.className = 'cd-card-detail';
    nextEl.innerHTML = `<span class="cd-detail-label">next run</span><span class="cd-detail-val">${relativeTime(job.next_run)}</span>`;

    const durEl = document.createElement('div');
    durEl.className = 'cd-card-detail';
    durEl.innerHTML = `<span class="cd-detail-label">duration</span><span class="cd-detail-val">${job.last_duration || '—'}</span>`;

    details.appendChild(lastEl);
    details.appendChild(nextEl);
    details.appendChild(durEl);
    body.appendChild(details);

    // Last output (collapsible)
    if (job.last_output && job.last_output !== '—') {
      const outputEl = document.createElement('div');
      outputEl.className = 'cd-card-output';
      outputEl.textContent = job.last_output;
      body.appendChild(outputEl);
    }

    card.appendChild(body);
    grid.appendChild(card);
  });

  return grid;
}

/**
 * Build the cron dashboard container.
 */
function buildDashboard(data) {
  const container = document.createElement('div');
  container.className = 'cd-dashboard';

  if (!data || !data.jobs || !data.jobs.length) {
    container.innerHTML = '<div class="empty-state"><div class="big-icon">◉</div>No cron jobs loaded</div>';
    return container;
  }

  // Count statuses
  const counts = { all: data.jobs.length, healthy: 0, failing: 0, never_run: 0 };
  data.jobs.forEach(j => {
    if (j.status === 'healthy') counts.healthy++;
    else if (j.status === 'failing') counts.failing++;
    else if (j.status === 'never_run' || j.status === 'disabled') counts.never_run++;
  });

  // Updated-at timestamp
  const updatedEl = document.createElement('div');
  updatedEl.className = 'cd-updated';
  updatedEl.textContent = 'updated ' + relativeTime(data.updated_at);
  container.appendChild(updatedEl);

  // Filter bar
  container.appendChild(buildFilterBar(counts));

  // Card grid
  container.appendChild(buildGrid(data.jobs));

  return container;
}

/**
 * Re-render the dashboard in-place.
 */
function reRender() {
  const root = document.getElementById('cron-container');
  if (!root || !cronCache) return;
  root.innerHTML = '';
  root.appendChild(buildDashboard(cronCache));
}

/**
 * Render the cron dashboard into a container element.
 * Starts a 10s auto-refresh interval.
 * @param {HTMLElement} container
 */
export async function renderCronDashboard(container) {
  container.innerHTML = '';
  container.id = 'cron-container';

  // Inject inline styles once
  if (!document.querySelector('style[data-cron-panel]')) {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-cron-panel', '');
    styleEl.textContent = inlineStyles();
    document.head.appendChild(styleEl);
  }

  // Show loading
  container.innerHTML = '<div class="empty-state" style="padding: 40px;"><div class="big-icon">◉</div>Loading cron jobs…</div>';

  const data = await fetchCronStatus();
  cronCache = data;

  container.innerHTML = '';
  container.appendChild(buildDashboard(data));

  // Clear existing refresh interval
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(async () => {
    const data = await fetchCronStatus();
    if (data && data.jobs) {
      cronCache = data;
      reRender();
    }
  }, 10000);
}

/**
 * Stop the cron dashboard refresh interval.
 */
export function stopCronDashboard() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

/* ── Inline CSS (self-contained module) ── */

function inlineStyles() {
  return `
/* ── Cron Dashboard ──────────────────────── */

.cd-dashboard {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cd-updated {
  font-size: 9px;
  color: var(--fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Filter bar */
.cd-filter-bar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.cd-filter-btn {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-dim);
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.cd-filter-btn:hover {
  border-color: var(--border-light);
  color: var(--fg);
}

.cd-filter-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(0, 204, 102, 0.08);
}

.cd-filter-count {
  font-size: 10px;
  background: var(--bg);
  padding: 1px 6px;
  border-radius: 6px;
  color: var(--fg-dim);
}

.cd-filter-btn.active .cd-filter-count {
  color: var(--accent);
  background: rgba(0, 204, 102, 0.12);
}

/* Card grid */
.cd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 10px;
  overflow-y: auto;
  flex: 1;
  padding-bottom: 16px;
}

/* Card */
.cd-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  display: flex;
  overflow: hidden;
  transition: border-color 0.2s;
  cursor: default;
}

.cd-card:hover {
  border-color: var(--border-light);
}

.cd-card-strip {
  width: 4px;
  flex-shrink: 0;
}

.cd-card-strip.cd-dot-green  { background: var(--accent); }
.cd-card-strip.cd-dot-red    { background: var(--danger); }
.cd-card-strip.cd-dot-yellow { background: var(--warn); }
.cd-card-strip.cd-dot-grey   { background: #555; }

/* Dot */
.cd-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

.cd-dot.cd-dot-green  { background: var(--accent); box-shadow: 0 0 4px var(--accent-dim); }
.cd-dot.cd-dot-red    { background: var(--danger); box-shadow: 0 0 4px rgba(204,51,51,0.4); }
.cd-dot.cd-dot-yellow { background: var(--warn);  box-shadow: 0 0 3px rgba(204,170,0,0.4); }
.cd-dot.cd-dot-grey   { background: #555; }

/* Card body */
.cd-card-body {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.cd-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cd-job-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-run-btn {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 10px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-dim);
  cursor: pointer;
  transition: all 0.15s;
}

.cd-run-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(0, 204, 102, 0.05);
}

.cd-run-btn:disabled {
  color: var(--accent);
  border-color: var(--accent-dim);
  background: rgba(0, 204, 102, 0.05);
  cursor: default;
}

.cd-toggle-btn {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 10px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--fg-dim);
  cursor: pointer;
  transition: all 0.15s;
}

.cd-toggle-btn:hover {
  border-color: var(--warn);
  color: var(--warn);
  background: rgba(204, 170, 0, 0.05);
}

.cd-toggle-btn:disabled {
  color: var(--warn);
  border-color: var(--warn-dim, rgba(204, 170, 0, 0.3));
  background: rgba(204, 170, 0, 0.05);
  cursor: default;
}

.cd-toggle-err {
  font-size: 9px;
  color: var(--danger);
  font-family: var(--font-mono);
  padding: 0 4px;
  flex-shrink: 0;
}

.cd-run-error {
  font-size: 9px;
  color: var(--danger);
  font-family: var(--font-mono);
  padding: 0 4px;
  flex-shrink: 0;
}

/* Schedule */
.cd-card-sched {
  font-size: 10px;
  color: var(--fg-dim);
  font-family: var(--font-mono);
  padding: 2px 0;
}

/* Details grid */
.cd-card-details {
  display: flex;
  gap: 16px;
  font-size: 10px;
}

.cd-card-detail {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cd-detail-label {
  font-size: 8px;
  color: var(--fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.cd-detail-val {
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: 10px;
}

/* Last output */
.cd-card-output {
  font-size: 9px;
  color: var(--fg-dim);
  font-family: var(--font-mono);
  background: var(--bg);
  border-radius: 3px;
  padding: 4px 8px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
`;
}
