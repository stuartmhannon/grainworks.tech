/**
 * tower-panel.js — Tower Control Panel
 * Overview, container cards, storage explorer, notification stream
 * Import: import { renderTower } from './js/tower-panel.js';
 */

import { relativeTime, escapeHtml } from './shared-utils.js';

/* ── Data ──────────────────────────────────── */

export function renderTower(container) {
  container.innerHTML = `
    <div class="tw-overview" id="tw-overview"></div>
    <div class="tw-section">
      <div class="tw-section-header">
        <span>▣ containers</span>
        <span id="tw-container-count"></span>
        <button id="tw-refresh-btn" class="tw-refresh-btn" title="Refresh tower data">↻</button>
      </div>
      <div class="tw-container-grid" id="tw-containers"></div>
    </div>
    <div class="tw-section">
      <div class="tw-section-header"><span>▤ storage</span></div>
      <div id="tw-storage"></div>
    </div>
    <div class="tw-section">
      <div class="tw-section-header"><span>◉ activity</span></div>
      <div id="tw-activity"></div>
    </div>
  `;
  loadTowerData(container);
}

async function loadTowerData(container) {
  let data = null;
  try {
    const resp = await fetch('./data/tower-status.json?_=' + Date.now());
    if (resp.ok) data = await resp.json();
  } catch { /* fall through */ }

  if (!data) {
    // Fallback: try system.json (the status panel data source)
    try {
      const resp = await fetch('./data/system.json?_=' + Date.now());
      if (resp.ok) {
        const sys = await resp.json();
        data = {
          system: sys.system || {},
          array: sys.tower?.array_disk ? { total: sys.tower.array_disk, used: sys.tower.array_used || '', free: sys.tower.array_free || '', used_pct: sys.tower.array_pct || '0' } : {},
          health: { running: sys.tower?.containers || 0, stopped: 0, total_containers: sys.tower?.containers || 0 },
          docker: (sys.tower?.containers_list || []).map(c => typeof c === 'string' ? { name: c, status: 'running', image: '', uptime: '', ports: '' } : c),
        };
      }
    } catch { /* fall through */ }
  }

  if (data) {
    renderOverview(container, data);
    renderContainers(container, data);
    renderStorage(container, data);
    renderActivity(container, data);
    wireRefreshButton(container);
  } else {
    container.innerHTML = '<div class="empty-state"><div class="big-icon">⚠</div>Tower data unavailable — run the sync pipeline first</div>';
  }
}

function renderOverview(container, data) {
  const el = container.querySelector('#tw-overview');
  const sys = data.system || {};
  const arr = data.array || {};
  const health = data.health || {};

  el.innerHTML = `
    <div class="tw-stat"><span class="tw-stat-num">${health.running || 0}</span><span class="tw-stat-label">containers running</span></div>
    <div class="tw-stat ${(health.stopped || 0) > 0 ? 'error' : 'ok'}"><span class="tw-stat-num">${health.stopped || 0}</span><span class="tw-stat-label">stopped</span></div>
    <div class="tw-stat ${parseInt(arr.used_pct) > 90 ? 'warn' : 'ok'}"><span class="tw-stat-num">${arr.used_pct || '?'}%</span><span class="tw-stat-label">array used</span></div>
    <div class="tw-stat"><span class="tw-stat-num">${(health.total_containers || 0)}</span><span class="tw-stat-label">total containers</span></div>
    <div class="tw-stat"><span class="tw-stat-num">${sys.mem_pct || '?'}%</span><span class="tw-stat-label">memory</span></div>
    <div class="tw-stat"><span class="tw-stat-num">${sys.load || '?'}</span><span class="tw-stat-label">load avg</span></div>
  `;
}

function renderContainers(container, data) {
  const el = container.querySelector('#tw-containers');
  const countEl = container.querySelector('#tw-container-count');
  const containers = data.docker || [];

  countEl.textContent = `(${containers.length})`;

  if (containers.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="big-icon">◈</div>No containers found</div>';
    return;
  }

  // Sort: online first, then running, then error
  containers.sort((a, b) => {
    const order = { online: 0, running: 1, error: 2 };
    return (order[a.status] || 3) - (order[b.status] || 3);
  });

  el.innerHTML = containers.map(c => {
    const dotClass = c.status === 'online' ? 'ok' : c.status === 'running' ? 'highlight' : 'error';
    return `
      <div class="tw-container-card" data-name="${escapeHtml(c.name)}">
        <div class="tw-cc-header">
          <span class="status-dot ${dotClass}"></span>
          <span class="tw-cc-name">${escapeHtml(c.name)}</span>
          <span class="tw-cc-status ${c.status}">${c.status}</span>
        </div>
        <div class="tw-cc-image">${escapeHtml(c.image || '—')}</div>
        <div class="tw-cc-uptime">${escapeHtml(c.uptime || '')}</div>
        <div class="tw-cc-ports">${escapeHtml(c.ports || '')}</div>
        <div class="tw-cc-actions">
          <button class="tw-act-btn" data-action="restart" data-container="${escapeHtml(c.name)}">restart</button>
          <button class="tw-act-btn" data-action="logs" data-container="${escapeHtml(c.name)}">logs</button>
        </div>
      </div>
    `;
  }).join('');

  // Wire action buttons
  el.querySelectorAll('.tw-act-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const action = btn.dataset.action;
      const name = btn.dataset.container;
      if (action === 'restart') {
        if (!confirm(`Restart ${name}?`)) return;
        try {
          btn.textContent = 'restarting...';
          const resp = await fetch('/api/tower/restart/' + encodeURIComponent(name), { method: 'POST' });
          btn.textContent = resp.ok ? 'done' : 'failed';
          setTimeout(() => { btn.textContent = 'restart'; }, 2000);
        } catch {
          btn.textContent = 'error';
        }
      } else if (action === 'logs') {
        const url = `https://tower.camel-hoki.ts.net/`;
        window.open(url, '_blank');
      }
    });
  });
}

function renderStorage(container, data) {
  const el = container.querySelector('#tw-storage');
  const arr = data.array || {};

  if (!arr.total) {
    el.innerHTML = '<div class="tw-empty">No storage data</div>';
    return;
  }

  const pct = parseInt(arr.used_pct) || 0;
  const barColor = pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warn)' : 'var(--accent)';

  el.innerHTML = `
    <div class="tw-storage-grid">
      <div class="tw-storage-item">
        <div class="tw-si-label">array</div>
        <div class="tw-si-value">${arr.total} total</div>
        <div class="tw-si-bar"><div class="tw-si-fill" style="width:${pct}%;background:${barColor}"></div></div>
        <div class="tw-si-detail">${arr.used} used · ${arr.free} free</div>
      </div>
      ${arr.cache_total ? `
      <div class="tw-storage-item">
        <div class="tw-si-label">cache</div>
        <div class="tw-si-value">${arr.cache_total} total</div>
        <div class="tw-si-bar"><div class="tw-si-fill" style="width:${arr.cache_pct}%;background:${parseInt(arr.cache_pct) > 90 ? 'var(--danger)' : parseInt(arr.cache_pct) > 70 ? 'var(--warn)' : 'var(--accent-dim)'}"></div></div>
        <div class="tw-si-detail">${arr.cache_used} used · ${arr.cache_free} free</div>
      </div>` : ''}
    </div>
  `;
}

function renderActivity(container, data) {
  const el = container.querySelector('#tw-activity');
  const health = data.health || {};

  const items = [
    { icon: health.array_pct > 90 ? '⚠' : '✓', text: `Array at ${health.array_pct}% capacity`, time: data.updated_at },
    { icon: (health.stopped || 0) > 0 ? '⚠' : '✓', text: `${health.running}/${health.total_containers} containers running`, time: data.updated_at },
  ];

  el.innerHTML = items.map(item => `
    <div class="tw-activity-item">
      <span class="tw-activity-icon">${item.icon}</span>
      <span class="tw-activity-text">${escapeHtml(item.text)}</span>
      <span class="tw-activity-time">${relativeTime(item.time)}</span>
    </div>
  `).join('');
}

function wireRefreshButton(container) {
  const btn = container.querySelector('#tw-refresh-btn');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = 'true';

  btn.addEventListener('click', async () => {
    btn.classList.add('spinning');
    btn.textContent = '⟳';
    await loadTowerData(container);
  });
}


