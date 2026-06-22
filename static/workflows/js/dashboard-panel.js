/**
 * dashboard-panel.js — Morning Dashboard (default landing tab)
 * Shows overview, watchlist, recent completions, quick actions
 * grainworks workbench · v0.9
 */

import { escapeHtml } from './shared-utils.js';

export function renderDashboard(container) {
  container.innerHTML = `
    <div class="db-overview-row" id="db-overview"></div>
    <div class="db-watchlist" id="db-watchlist">
      <div class="db-section-header"><span>◆ watchlist</span></div>
      <div id="db-watchlist-items"></div>
    </div>
    <div class="db-two-col">
      <div class="db-recent" id="db-recent">
        <div class="db-section-header"><span>◀ recent completions</span></div>
        <div id="db-recent-items"></div>
      </div>
      <div class="db-quick" id="db-quick">
        <div class="db-section-header"><span>▸ quick actions</span></div>
        <div id="db-quick-items"></div>
      </div>
    </div>
  `;
  loadDashboardData(container);
}

async function loadDashboardData(container) {
  const [queue, cron, ideas] = await Promise.all([
    fetch('./data/tasks.json?_=' + Date.now()).then(r => r.json()).catch(() => ({ tasks: [] })),
    fetch('./data/cron-status.json?_=' + Date.now()).then(r => r.json()).catch(() => ({ jobs: [] })),
    fetch('./data/ideas-index.json?_=' + Date.now()).then(r => r.json()).catch(() => ({ ideas: [] }))
  ]);

  const tasks = queue.tasks || [];
  const jobs = cron.jobs || [];
  const ideasList = ideas.ideas || [];

  const waiting = tasks.filter(t => t.status === 'waiting');
  const pending = tasks.filter(t => t.status === 'pending');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const failingJobs = jobs.filter(j => j.status === 'failing');
  const staleJobs = jobs.filter(j => j.last_run_at === null || j.status === 'stale');
  const undecidedIdeas = ideasList.filter(i => i.status !== 'declined');

  // ── Overview row ──
  const overview = container.querySelector('#db-overview');
  overview.innerHTML = `
    <div class="db-stat ${waiting.length > 0 ? 'accent' : ''}"><span class="db-stat-num">${waiting.length}</span><span class="db-stat-label">waiting</span></div>
    <div class="db-stat ${pending.length > 0 ? 'info' : ''}"><span class="db-stat-num">${pending.length}</span><span class="db-stat-label">queued</span></div>
    <div class="db-stat ${inProgress.length > 0 ? 'highlight' : ''}"><span class="db-stat-num">${inProgress.length}</span><span class="db-stat-label">active</span></div>
    <div class="db-stat ${failingJobs.length > 0 ? 'error' : 'ok'}"><span class="db-stat-num">${failingJobs.length}</span><span class="db-stat-label">failing</span></div>
    <div class="db-stat ${staleJobs.length > 0 ? 'warn' : ''}"><span class="db-stat-num">${staleJobs.length}</span><span class="db-stat-label">stale</span></div>
    <div class="db-stat"><span class="db-stat-num">${undecidedIdeas.length}</span><span class="db-stat-label">ideas</span></div>
  `;

  // ── Watchlist ──
  const watchItems = container.querySelector('#db-watchlist-items');
  const watchCandidates = [];

  // Items needing human decision (highest priority)
  for (const t of waiting) {
    watchCandidates.push({
      icon: '⏳',
      title: t.title,
      desc: t.goal ? t.goal.substring(0, 80) : 'needs your decision',
      type: 'task',
      id: t.id,
      priority: t.priority || 3
    });
  }

  // Failing crons
  for (const j of failingJobs) {
    watchCandidates.push({
      icon: '⚠',
      title: j.name,
      desc: `schedule: ${j.schedule || '?'}`,
      type: 'cron',
      id: j.name,
      priority: 5
    });
  }

  // Undecided ideas (top 3)
  for (const idea of undecidedIdeas.slice(0, 3)) {
    watchCandidates.push({
      icon: '◐',
      title: idea.title || '(idea)',
      desc: (idea.Context || idea.context || '').substring(0, 80),
      type: 'idea',
      id: idea.title,
      priority: 2
    });
  }

  // Stale crons
  for (const j of staleJobs.slice(0, 2)) {
    watchCandidates.push({
      icon: '○',
      title: j.name,
      desc: 'never run — check configuration',
      type: 'cron',
      id: j.name,
      priority: 2
    });
  }

  // Sort: priority desc
  watchCandidates.sort((a, b) => b.priority - a.priority);
  const topWatch = watchCandidates.slice(0, 8);

  if (topWatch.length === 0) {
    watchItems.innerHTML = '<div class="db-empty">all clear — nothing needs your attention</div>';
  } else {
    watchItems.innerHTML = topWatch.map(item => `
      <div class="db-watch-card" data-type="${item.type}" data-id="${escapeHtml(item.id)}">
        <div class="db-watch-icon">${item.icon}</div>
        <div class="db-watch-body">
          <div class="db-watch-title">${escapeHtml(item.title)}</div>
          <div class="db-watch-desc">${escapeHtml(item.desc)}</div>
        </div>
        <div class="db-watch-priority p${item.priority}">P${item.priority}</div>
      </div>
    `).join('');
  }

  // ── Recent completions ──
  const recentItems = container.querySelector('#db-recent-items');
  const completed = tasks.filter(t => t.status === 'completed').slice(-5);
  if (completed.length === 0) {
    recentItems.innerHTML = '<div class="db-empty">no completed tasks yet</div>';
  } else {
    recentItems.innerHTML = completed.reverse().map(t => `
      <div class="db-recent-item">
        <span class="db-recent-check">✓</span>
        <span class="db-recent-title">${escapeHtml(t.title || t.goal || 'task')}</span>
        <span class="db-recent-time">${t.completed_at ? timeAgo(t.completed_at) : ''}</span>
      </div>
    `).join('');
  }

  // ── Quick actions ──
  const quickItems = container.querySelector('#db-quick-items');
  const quickActions = [
    { icon: '◉', label: 'new task', action: 'open-queue' },
    { icon: '◉', label: 'open chat', action: 'open-chat' },
    { icon: '◷', label: 'cron dashboard', action: 'open-cron' },
    { icon: '◐', label: 'library', action: 'open-library' },
    { icon: '◈', label: 'workflows', action: 'open-dag' },
    { icon: '⧉', label: 'projects', action: 'open-projects' }
  ];
  quickItems.innerHTML = quickActions.map(qa => `
    <div class="db-quick-btn" data-action="${qa.action}">
      <span>${qa.icon}</span> ${qa.label}
    </div>
  `).join('');

  // Wire quick action clicks
  quickItems.querySelectorAll('.db-quick-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = btn.dataset.action;
      const tabName = action.replace('open-', '');
      // Trigger tab switch programmatically
      const navEl = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
      if (navEl) navEl.click();
    });
  });
}


function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}
