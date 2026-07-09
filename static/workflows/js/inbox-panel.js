/**
 * inbox-panel.js — Inbox tab for reviewable items
 * Waiting tasks, undecided ideas, cron failures needing acknowledgment
 * grainworks workbench · v0.9
 */

import { escapeHtml } from './shared-utils.js';

export function renderInbox(container) {
  // Clear any existing interval before setting a new one
  if (container._inboxInterval) {
    clearInterval(container._inboxInterval);
  }
  try {
    container.innerHTML = `
      <div class="inbox-toolbar">
        <span class="inbox-title">◐ inbox</span>
        <div class="inbox-filters">
          <span class="inbox-filter active" data-filter="all">all</span>
          <span class="inbox-filter" data-filter="task">tasks</span>
          <span class="inbox-filter" data-filter="cron">crons</span>
          <span class="inbox-filter" data-filter="idea">ideas</span>
        </div>
        <span id="inbox-count" class="inbox-count"></span>
      </div>
      <div class="inbox-list" id="inbox-list">
        <div class="inbox-loading"><div class="inbox-spinner"></div>Loading inbox...</div>
      </div>
    `;

    container.querySelectorAll('.inbox-filter').forEach(f => {
      f.addEventListener('click', () => {
        container.querySelectorAll('.inbox-filter').forEach(ff => ff.classList.remove('active'));
        f.classList.add('active');
        renderInboxItems(container);
      });
    });

    renderInboxItems(container);
    // Auto-refresh every 30s
    const interval = setInterval(() => renderInboxItems(container), 30000);
    // Store cleanup reference
    container._inboxInterval = interval;
  } catch (err) {
    console.error('renderInbox failed:', err);
    const panel = container || document.querySelector('#tab-inbox');
    if (panel) {
      panel.innerHTML = '<div class="error-fallback"><p>Something went wrong loading this module.</p></div>';
    }
  }
}

export function stopInbox() {
  // Called if needed — currently handled by tab-switch cleanup
}

async function renderInboxItems(container) {
  var _pm = 'renderInboxItems';
  try {
    performance.mark(_pm + '-start');

    const [queue, cron, ideas] = await Promise.all([
      fetch('./data/tasks.json?_=' + Date.now()).then(r => r.json()).catch(() => ({ tasks: [] })),
      fetch('./data/cron-status.json?_=' + Date.now()).then(r => r.json()).catch(() => ({ jobs: [] })),
      fetch('./data/ideas-index.json?_=' + Date.now()).then(r => r.json()).catch(() => ({ ideas: [] }))
    ]);

    const allTasks = queue.tasks || [];
    const allJobs = cron.jobs || [];
    const allIdeas = ideas.ideas || [];

    const activeFilter = container.querySelector('.inbox-filter.active')?.dataset?.filter || 'all';

    // Build inbox items
    const items = [];

    // Waiting tasks
    for (const t of allTasks.filter(t => t.status === 'waiting')) {
      items.push({
        type: 'task',
        icon: '⏳',
        title: t.title || t.goal || 'unnamed task',
        desc: (t.goal || t.context || '').substring(0, 100),
        id: `task-${t.id}`,
        actions: ['approve', 'reject', 'defer'],
        data: t
      });
    }

    // Failing crons (last 24h)
    const now = Date.now();
    const dayAgo = now - 86400000;
    for (const j of allJobs.filter(j => j.status === 'failing')) {
      const lastRun = j.last_run_at ? new Date(j.last_run_at).getTime() : 0;
      if (lastRun > dayAgo || lastRun === 0) {
        items.push({
          type: 'cron',
          icon: '⚠',
          title: j.name || 'unknown cron',
          desc: j.error || `schedule: ${j.schedule || '?'} · no successful run`,
          id: `cron-${j.name}`,
          actions: ['run', 'dismiss'],
          data: j
        });
      }
    }

    // Undecided ideas
    for (const idea of allIdeas.filter(i => i.status !== 'declined' && i.status !== 'adopted')) {
      items.push({
        type: 'idea',
        icon: '◐',
        title: idea.title || '(idea)',
        desc: (idea.Context || idea.context || '').substring(0, 120),
        id: `idea-${(idea.title || 'unknown').replace(/\s+/g, '-')}`,
        actions: ['adopt', 'decline', 'snooze'],
        data: idea
      });
    }

    // Apply filter
    const filtered = activeFilter === 'all' ? items : items.filter(i => i.type === activeFilter);

    // Update count
    const countEl = container.querySelector('#inbox-count');
    if (countEl) countEl.textContent = `(${filtered.length})`;

    const listEl = container.querySelector('#inbox-list');
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><div class="big-icon">✓</div>inbox clear</div>';
      return;
    }

    // Cap visible items at 50, show "more" link
    const SHOW_MAX = 50;
    const showTotal = filtered.length;
    const showing = filtered.slice(0, SHOW_MAX);
    let moreHtml = '';
    if (showTotal > SHOW_MAX) {
      moreHtml = `<div class="inbox-show-more" style="text-align:center;padding:8px;cursor:pointer;color:var(--accent);font-size:11px">Show all ${showTotal} items ▾</div>`;
    }

    listEl.innerHTML = showing.map(item => `
      <div class="inbox-card" data-id="${escapeHtml(item.id)}" data-type="${item.type}">
        <div class="inbox-card-icon">${item.icon}</div>
        <div class="inbox-card-body">
          <div class="inbox-card-title">${escapeHtml(item.title)}</div>
          <div class="inbox-card-desc">${escapeHtml(item.desc)}</div>
          <div class="inbox-card-meta">${item.type}</div>
        </div>
        <div class="inbox-card-actions">
          ${item.actions.map(a => `<button class="inbox-btn btn-${a}" data-action="${a}">${a}</button>`).join('')}
        </div>
      </div>
    `).join('') + moreHtml;

    // Wire action buttons
    listEl.querySelectorAll('.inbox-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = btn.closest('.inbox-card');
        const action = btn.dataset.action;
        if (!card || !action) return;
        const type = card.dataset.type;
        const id = card.dataset.id;
        // Animate removal
        card.style.opacity = '0.3';
        await handleInboxAction(type, id, action);
        card.remove();
        // Update count
        const remaining = listEl.querySelectorAll('.inbox-card').length;
        const countEl = container.querySelector('#inbox-count');
        if (countEl) countEl.textContent = `(${remaining})`;
        if (remaining === 0) {
          listEl.innerHTML = '<div class="empty-state"><div class="big-icon">✓</div>inbox clear</div>';
        }
      });
    });

    // Wire "show more" link
    const moreEl = listEl.querySelector('.inbox-show-more');
    if (moreEl) {
      moreEl.addEventListener('click', function () {
        this.remove();
        const extra = filtered.slice(SHOW_MAX);
        extra.forEach(item => {
          const div = document.createElement('div');
          div.innerHTML = `
      <div class="inbox-card" data-id="${escapeHtml(item.id)}" data-type="${item.type}">
        <div class="inbox-card-icon">${item.icon}</div>
        <div class="inbox-card-body">
          <div class="inbox-card-title">${escapeHtml(item.title)}</div>
          <div class="inbox-card-desc">${escapeHtml(item.desc)}</div>
          <div class="inbox-card-meta">${item.type}</div>
        </div>
        <div class="inbox-card-actions">
          ${item.actions.map(a => `<button class="inbox-btn btn-${a}" data-action="${a}">${a}</button>`).join('')}
        </div>
      </div>`;
          const card = div.firstElementChild;
          listEl.appendChild(card);
          // Wire buttons on this card
          card.querySelectorAll('.inbox-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const parentCard = btn.closest('.inbox-card');
              const action = btn.dataset.action;
              if (!parentCard || !action) return;
              const type = parentCard.dataset.type;
              const id = parentCard.dataset.id;
              parentCard.style.opacity = '0.3';
              await handleInboxAction(type, id, action);
              parentCard.remove();
              const remaining = listEl.querySelectorAll('.inbox-card').length;
              const countEl = container.querySelector('#inbox-count');
              if (countEl) countEl.textContent = `(${remaining})`;
              if (remaining === 0) {
                listEl.innerHTML = '<div class="empty-state"><div class="big-icon">✓</div>inbox clear</div>';
              }
            });
          });
        });
      });
    }
    performance.mark(_pm + '-end');
    performance.measure(_pm, _pm + '-start', _pm + '-end');
  } catch (err) {
    console.error('renderInboxItems failed:', err);
    const panel = container || document.querySelector('#tab-inbox');
    if (panel) {
      panel.innerHTML = '<div class="error-fallback"><p>Something went wrong loading this module.</p></div>';
    }
  }
}

async function handleInboxAction(type, id, action) {

  if (type === 'task' && (action === 'approve' || action === 'reject' || action === 'defer')) {
    try {
      const numericId = id.replace('task-', '');
      const statusMap = { approve: 'pending', reject: 'cancelled', defer: 'deferred' };
      await fetch('/api/queue/' + numericId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusMap[action] })
      });
    } catch (e) {
      console.warn('Queue action failed:', e);
    }
  }

  if (type === 'idea' && (action === 'adopt' || action === 'decline' || action === 'snooze')) {
    // POST action to ideas backend
    try {
      await fetch('/api/ideas/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action })
      });
    } catch (e) {
      console.warn('Idea action failed (endpoint may not exist):', e);
    }
  }

  if (type === 'cron' && action === 'run') {
    try {
      const cronName = id.replace('cron-', '');
      await fetch('/api/cron/run/' + encodeURIComponent(cronName), {
        method: 'POST'
      });
    } catch (e) {
      console.warn('Cron run failed:', e);
    }
  }

  if (type === 'cron' && action === 'dismiss') {
    // dismissed — no-op for now
  }
}
