/**
 * email-panel.js — Email tab for monitoring outbound/inbound email log
 * grainworks workbench · v0.9
 */

import { escapeHtml } from './shared-utils.js';

export function renderEmail(container) {
  // Clear any existing interval before setting a new one
  if (container._emailInterval) {
    clearInterval(container._emailInterval);
  }
  container.innerHTML = `
    <div class="email-toolbar">
      <span class="email-title">✉ email</span>
      <div class="email-filters">
        <span class="email-filter active" data-filter="all">all</span>
        <span class="email-filter" data-filter="sent">sent</span>
        <span class="email-filter" data-filter="received">received</span>
        <span class="email-filter" data-filter="failed">failed</span>
      </div>
      <span id="email-count" class="email-count"></span>
    </div>
    <div class="email-stats" id="email-stats">
      <div class="empty-state"><div class="big-icon">◐</div>Loading...</div>
    </div>
    <div class="email-list" id="email-list">
      <div class="empty-state"><div class="big-icon">✉</div>Loading...</div>
    </div>
  `;

  container.querySelectorAll('.email-filter').forEach(f => {
    f.addEventListener('click', () => {
      container.querySelectorAll('.email-filter').forEach(ff => ff.classList.remove('active'));
      f.classList.add('active');
      renderEmailList(container);
    });
  });

  renderEmailStats(container);
  renderEmailList(container);

  // Auto-refresh every 60s
  const interval = setInterval(() => {
    renderEmailStats(container);
    renderEmailList(container);
  }, 60000);
  container._emailInterval = interval;
}

export function stopEmail() {
  // Called if needed — currently handled by tab-switch cleanup
}

async function renderEmailStats(container) {
  const statsEl = container.querySelector('#email-stats');
  const data = await fetchJSON('./data/email-log.json');
  if (!data || !data._meta) {
    statsEl.innerHTML = '<div class="empty-state"><div class="big-icon">⚠</div>No email data available</div>';
    return;
  }

  const m = data._meta;
  statsEl.innerHTML = `
    <div class="email-stat">
      <span class="email-stat-num">${m.total || 0}</span>
      <span class="email-stat-label">total</span>
    </div>
    <div class="email-stat">
      <span class="email-stat-num">${m.today || 0}</span>
      <span class="email-stat-label">today</span>
    </div>
    <div class="email-stat">
      <span class="email-stat-num">${m.unread || 0}</span>
      <span class="email-stat-label">unread</span>
    </div>
    <div class="email-stat">
      <span class="email-stat-num">${m.last_sync ? timeAgo(m.last_sync) : '—'}</span>
      <span class="email-stat-label">last sync</span>
    </div>
  `;
}

async function renderEmailList(container) {
  const data = await fetchJSON('./data/email-log.json');
  const activeFilter = container.querySelector('.email-filter.active')?.dataset?.filter || 'all';

  const countEl = container.querySelector('#email-count');
  const listEl = container.querySelector('#email-list');
  const entries = (data && data.entries) || [];

  let filtered = entries;
  if (activeFilter !== 'all') {
    filtered = entries.filter(e => (e.status || '').toLowerCase() === activeFilter);
  }

  if (countEl) {
    countEl.textContent = `(${filtered.length})`;
  }

  if (!filtered || filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="big-icon">✓</div>no emails to show</div>';
    return;
  }

  listEl.innerHTML = filtered.map(e => `
    <div class="email-entry" data-idx="${escapeHtml(String(entries.indexOf(e)))}" data-status="${escapeHtml((e.status || 'unknown').toLowerCase())}">
      <span class="email-entry-time">${e.timestamp ? formatTime(e.timestamp) : '—'}</span>
      <span class="email-entry-sender">${escapeHtml(e.from || e.sender || '—')}</span>
      <span class="email-entry-subject">${escapeHtml(e.subject || '(no subject)')}</span>
      <span class="email-entry-status status-${escapeHtml((e.status || 'unknown').toLowerCase())}">${escapeHtml(e.status || 'unknown')}</span>
    </div>
  `).join('');

  // Wire click-to-expand
  listEl.querySelectorAll('.email-entry').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx, 10);
      if (isNaN(idx)) return;
      showEmailDetail(container, entries[idx]);
    });
  });
}

function showEmailDetail(container, entry) {
  // Remove existing detail overlay
  const existing = document.querySelector('.email-detail-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'email-detail-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.innerHTML = `
    <div class="email-detail">
      <div class="email-detail-header">
        <span class="email-detail-close">✕</span>
        <span class="email-detail-subject">${escapeHtml(entry.subject || '(no subject)')}</span>
      </div>
      <div class="email-detail-body">
        <div class="email-detail-field">
          <span class="email-detail-label">from</span>
          <span class="email-detail-value">${escapeHtml(entry.from || entry.sender || '—')}</span>
        </div>
        <div class="email-detail-field">
          <span class="email-detail-label">to</span>
          <span class="email-detail-value">${escapeHtml(entry.to || entry.recipient || '—')}</span>
        </div>
        <div class="email-detail-field">
          <span class="email-detail-label">status</span>
          <span class="email-detail-value status-${escapeHtml((entry.status || 'unknown').toLowerCase())}">${escapeHtml(entry.status || 'unknown')}</span>
        </div>
        <div class="email-detail-field">
          <span class="email-detail-label">timestamp</span>
          <span class="email-detail-value">${escapeHtml(entry.timestamp || '—')}</span>
        </div>
        ${entry.error ? `
        <div class="email-detail-field">
          <span class="email-detail-label">error</span>
          <span class="email-detail-value email-error">${escapeHtml(entry.error)}</span>
        </div>` : ''}
        ${entry.body ? `
        <div class="email-detail-field email-body-field">
          <span class="email-detail-label">body</span>
          <pre class="email-body">${escapeHtml(entry.body.substring(0, 2000))}${entry.body.length > 2000 ? '...' : ''}</pre>
        </div>` : ''}
        ${entry.attachments && entry.attachments.length > 0 ? `
        <div class="email-detail-field">
          <span class="email-detail-label">attachments (${entry.attachments.length})</span>
          <span class="email-detail-value">${entry.attachments.map(a => escapeHtml(a.name || a)).join(', ')}</span>
        </div>` : ''}
      </div>
    </div>
  `;

  overlay.querySelector('.email-detail-close').addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function fetchJSON(url) {
  return fetch(url + '?_=' + Date.now())
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return ts; }
}

function timeAgo(ts) {
  try {
    const now = Date.now();
    const then = new Date(ts).getTime();
    if (isNaN(then)) return '—';
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  } catch { return '—'; }
}

