/**
 * grainworks Status Panel v0.2
 * Live system health + agent status grid + terminal log viewer.
 * Loads data from synced JSON files instead of generating random/fake data.
 * Zero dependencies. ES6 module.
 */

import { escapeHtml, fetchJSON } from './shared-utils.js';

let lastSystemData = null;
let lastLogData = null;
let lastRouteActivity = null;

/**
 * Load live system + log data from server.
 */
export async function loadLiveData() {
  const [sys, logs, ra] = await Promise.all([
    fetchJSON('./data/system.json'),
    fetchJSON('./data/logs.json'),
    fetchJSON('./data/route-activity.json'),
  ]);
  if (sys) lastSystemData = sys;
  if (logs) lastLogData = logs;
  if (ra) lastRouteActivity = ra;
  return { system: lastSystemData, logs: lastLogData, routeActivity: lastRouteActivity };
}

/**
 * Render system health bar at top of status panel.
 */
function renderSystemBar(system) {
  const bar = document.createElement('div');
  bar.className = 'system-bar';

  if (!system) {
    bar.innerHTML = '<div class="metric"><span class="metric-label">status</span><span class="metric-value error">◉ offline — no data</span></div>';
    return bar;
  }

  const mac = system.system || {};
  const tower = system.tower || {};
  const generatedAt = system.generated_at
    ? new Date(system.generated_at).toLocaleTimeString()
    : '—';

  const gwClass = mac.gateway === 'running' ? 'ok' : 'error';
  const loadStr = mac.load_avg?.length ? mac.load_avg.map(x => x.toFixed(1)).join(' ') : '—';

  // Container count helps color
  const containerCount = tower.containers || 0;

  const metrics = [
    { label: 'gateway', value: `<span class="metric-dot ${gwClass}"></span>${mac.gateway || '—'}`, cls: gwClass },
    { label: 'host', value: mac.hostname || '—', cls: 'dim' },
    { label: 'uptime', value: `mac ${mac.uptime || '—'} · tower ${tower.uptime || '—'}`, cls: 'dim' },
    { label: 'load', value: loadStr, cls: 'dim' },
    { label: 'disk', value: mac.disk || '—', cls: 'dim' },
    { label: 'memory', value: mac.memory || '—', cls: 'dim' },
    { label: 'containers', value: `${containerCount} running`, cls: containerCount > 0 ? 'ok' : 'warn' },
    { label: 'models', value: (mac.ollama?.length || 0) + ' ollama', cls: mac.ollama?.length ? 'ok' : 'warn' },
    { label: 'updated', value: generatedAt, cls: 'dim' },
  ];

  metrics.forEach(m => {
    const div = document.createElement('div');
    div.className = 'metric';
    div.innerHTML = `<span class="metric-label">${m.label}</span><span class="metric-value ${m.cls}">${m.value}</span>`;
    bar.appendChild(div);
  });

  return bar;
}

/**
 * Render agent status grid from routes data.
 * Agents get dynamic status based on route activity and priority.
 * Clicking a card shows detail in a slide-in panel.
 */
function renderAgentGrid(routesData) {
  const grid = document.createElement('div');
  grid.className = 'status-grid';

  if (!routesData) {
    grid.innerHTML = '<div class="empty-state"><div class="big-icon">◉</div>No agent routes loaded</div>';
    return grid;
  }

  // Build domain→status lookup from route-activity data
  const statusMap = {};
  if (lastRouteActivity && lastRouteActivity.domains) {
    lastRouteActivity.domains.forEach(d => {
      // Map route-activity statuses to CSS status classes
      const map = { green: 'online', yellow: 'idle', red: 'error', grey: 'idle' };
      statusMap[d.domain] = map[d.status] || 'idle';
    });
  }

  const groups = ['operational', 'enterprise'];
  groups.forEach(group => {
    const agents = routesData[group] || [];
    agents.forEach(a => {
      if (!a || !a.domain) return;
      // Look up actual status; fall back to 'idle' if unknown
      const status = statusMap[a.domain] || 'idle';

      const card = document.createElement('div');
      card.className = 'status-card';
      card.style.cursor = 'pointer';
      card.dataset.domain = a.domain;
      card.dataset.group = group;
      card.innerHTML = `
        <div class="card-header">
          <span class="status-dot ${status}"></span>
          <div>
            <div class="domain-name">${a.domain}</div>
            <div class="agent-name">${a.agent || '—'} · ${group}</div>
          </div>
        </div>
        <div class="card-stats">
          <span>⌁ ${a.keywords?.length || 0} triggers</span>
          <span>⚑ pri ${a.priority || '—'}</span>
        </div>
      `;

      // Click handler — show agent detail
      card.addEventListener('click', () => {
        showAgentDetail(a, group, status);
      });

      grid.appendChild(card);
    });
  });

  return grid;
}

/**
 * Show a slide-in detail panel for an agent.
 */
function showAgentDetail(agent, group, status) {
  const overlay = document.createElement('div');
  overlay.className = 'project-detail-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const keywords = (agent.keywords || []).join(', ') || '—';
  const routes = (agent.routes || []).join(', ') || '—';

  overlay.innerHTML = `
    <div class="project-detail">
      <div class="pd-header">
        <h2 class="pd-name">${escapeHtml(agent.domain)}</h2>
        <button class="pd-close">✕</button>
      </div>
      <div class="pd-section">
        <div class="pd-section-title">agent</div>
        <div class="pd-desc">${escapeHtml(agent.agent || '—')}</div>
      </div>
      <div class="pd-section">
        <div class="pd-section-title">group</div>
        <div class="pd-desc">${escapeHtml(group)}</div>
      </div>
      <div class="pd-section">
        <div class="pd-section-title">status</div>
        <div class="pd-desc">${status}</div>
      </div>
      <div class="pd-section">
        <div class="pd-section-title">priority</div>
        <div class="pd-desc">${agent.priority || '—'}</div>
      </div>
      <div class="pd-section">
        <div class="pd-section-title">keywords</div>
        <div class="pd-desc" style="font-size:10px">${escapeHtml(keywords)}</div>
      </div>
      <div class="pd-section">
        <div class="pd-section-title">routes</div>
        <div class="pd-desc" style="font-size:10px">${escapeHtml(routes)}</div>
      </div>
    </div>
  `;

  const closeBtn = overlay.querySelector('.pd-close');
  if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}


/**
 * Render the status tab: system bar + agent grid.
 */
export function renderStatus(container, routesData) {
  container.innerHTML = '';

  // System health bar
  container.appendChild(renderSystemBar(lastSystemData));

  // Section header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'font-size:11px;color:var(--fg-dim);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;';
  hdr.textContent = 'agent routes';
  container.appendChild(hdr);

  // Agent grid
  container.appendChild(renderAgentGrid(routesData));
}

/**
 * Render terminal-style log output from live data or system data.
 */
export function renderLogs(container) {
  container.innerHTML = '';

  const logDiv = document.createElement('div');
  logDiv.className = 'log-container';

  let entries = lastLogData;
  if (!entries || !entries.length) {
    // Fallback: generate on-the-fly from system data if available
    if (lastSystemData) {
      entries = [];
      const mac = lastSystemData.system || {};
      const tower = lastSystemData.tower || {};
      const ts = lastSystemData.generated_at
        ? new Date(lastSystemData.generated_at).toLocaleTimeString()
        : '--:--:--';
      if (mac.gateway) entries.push({ t: ts, l: 'INFO', m: `[gateway] ${mac.gateway}` });
      if (mac.uptime) entries.push({ t: ts, l: 'INFO', m: `[system] mac uptime: ${mac.uptime}` });
      if (tower.uptime) entries.push({ t: ts, l: 'INFO', m: `[tower] uptime: ${tower.uptime}` });
      if (tower.containers) entries.push({ t: ts, l: 'INFO', m: `[tower] ${tower.containers} containers` });
      if (mac.ollama?.length) entries.push({ t: ts, l: 'INFO', m: `[ollama] ${mac.ollama.length} models: ${mac.ollama.slice(0,3).join(', ')}` });
      if (tower.array_disk) entries.push({ t: ts, l: 'INFO', m: `[tower] array: ${tower.array_disk}` });
      entries.push({ t: ts, l: 'INFO', m: '[data] live data feed active — v0.2' });
    } else {
      entries = [{ t: '--:--:--', l: 'WARN', m: 'no log data available — sync pipeline may not have run yet' }];
    }
  }

  // Cap log entries at 50, show more link
  const SHOW_MAX = 50;
  const showEntries = entries.slice(0, SHOW_MAX);

  showEntries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'log-entry';
    row.innerHTML = `
      <span class="log-time">${entry.t}</span>
      <span class="log-level ${(entry.l||'info').toLowerCase()}">${entry.l||'INFO'}</span>
      <span class="log-msg">${entry.m}</span>
    `;
    logDiv.appendChild(row);
  });

  if (entries.length > SHOW_MAX) {
    const moreEl = document.createElement('div');
    moreEl.className = 'log-show-more';
    moreEl.style.cssText = 'text-align:center;padding:8px;cursor:pointer;color:var(--accent);font-size:11px';
    moreEl.textContent = `Show all ${entries.length} log entries ▾`;
    moreEl.addEventListener('click', function () {
      this.remove();
      entries.slice(SHOW_MAX).forEach(entry => {
        const row = document.createElement('div');
        row.className = 'log-entry';
        row.innerHTML = `
          <span class="log-time">${entry.t}</span>
          <span class="log-level ${(entry.l||'info').toLowerCase()}">${entry.l||'INFO'}</span>
          <span class="log-msg">${entry.m}</span>
        `;
        logDiv.appendChild(row);
      });
    });
    logDiv.appendChild(moreEl);
  }

  container.appendChild(logDiv);
}
