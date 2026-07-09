/**
 * grainworks Projects Panel v0.3
 * Project card grid + slide-in detail panel.
 * Import: import { renderProjects } from './js/projects-panel.js';
 */

import { relativeTime } from './shared-utils.js';

let projectsCache = null;

/* ── State ─────────────────────────────────── */

/**
 * Fetch projects.json with cache-busting.
 */
async function fetchProjects() {
  try {
    const resp = await fetch('./data/projects.json?_=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch {
    return null;
  }
}



/**
 * Category icon map.
 */
const CAT_ICONS = {
  hardware: '⚡',
  software: '◆',
  web: '◎',
  personal: '★',
  research: '○',
  creative: '✧',
  admin: '▣',
  other: '●',
};

/**
 * Render the project card grid.
 */
export async function renderProjects(container) {
  container.innerHTML = '';

  if (!projectsCache) {
    container.innerHTML = '<div class="empty-state"><div class="big-icon">⧉</div>Loading projects…</div>';
    projectsCache = await fetchProjects();
  }

  if (!projectsCache || !projectsCache.length) {
    container.innerHTML = '<div class="empty-state"><div class="big-icon">⧉</div>No project data — run the sync pipeline first</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'project-grid';

  // Cap visible projects at 50, show more link
  var ppExpanded = window._ppExpanded || false;
  var SHOW_MAX = 50;
  var showProjects = (projectsCache.length > SHOW_MAX && !ppExpanded) ? projectsCache.slice(0, SHOW_MAX) : projectsCache;

  showProjects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.project = p.name;

    const icon = CAT_ICONS[p.category] || '●';
    const artifactCount = p.artifacts?.length ?? 0;
    const desc = p.description || `${p.total_files} files · ${artifactCount} artifacts`;

    card.innerHTML = `
      <div class="pc-header">
        <span class="pc-status-dot ${p.status}"></span>
        <span class="pc-name">${icon} ${p.name}</span>
        <span class="pc-category ${p.category}">${p.category}</span>
      </div>
      <div class="pc-desc">${desc}</div>
      <div class="pc-meta">
        <span>⌁ ${relativeTime(p.last_activity)}</span>
        <span>⚑ ${p.artifacts.length} artifacts</span>
        <span>▤ ${p.total_files} files</span>
      </div>
    `;

    card.addEventListener('click', () => showDetail(p));
    grid.appendChild(card);
  });

  container.appendChild(grid);

  // "Show all N projects" link
  if (projectsCache.length > SHOW_MAX && !ppExpanded) {
    const moreBtn = document.createElement('div');
    moreBtn.style.cssText = 'text-align:center;padding:12px;cursor:pointer;color:var(--accent);font-size:11px;';
    moreBtn.textContent = 'Show all ' + projectsCache.length + ' projects ▾';
    moreBtn.addEventListener('click', function() {
      window._ppExpanded = true;
      renderProjects(container);
    });
    container.appendChild(moreBtn);
  }
}

/**
 * Show the slide-in detail panel for a project.
 */
function showDetail(project) {
  // Remove any existing overlay
  const existing = document.querySelector('.project-detail-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'project-detail-overlay';

  const detail = document.createElement('div');
  detail.className = 'project-detail';

  const icon = CAT_ICONS[project.category] || '●';

  // Artifacts list
  let artifactsHtml = '';
  if (project.artifacts && project.artifacts.length) {
    project.artifacts.forEach(a => {
      const ageStr = a.age_days < 1 ? '< 1d' : `${Math.round(a.age_days)}d`;
      artifactsHtml += `
        <div class="pd-artifact">
          <span class="pd-art-type">${a.type}</span>
          <span class="pd-art-name">${a.name}</span>
          <span class="pd-art-age">${ageStr}</span>
        </div>
      `;
    });
  } else {
    artifactsHtml = '<div style="font-size:11px;color:var(--fg-dim);padding:4px 0;">No artifacts indexed</div>';
  }

  detail.innerHTML = `
    <div class="pd-header">
      <button class="pd-close">✕</button>
      <span class="pd-name">${icon} ${project.name}</span>
      <span class="pc-category ${project.category}">${project.category}</span>
    </div>

    ${project.description ? `
    <div class="pd-section">
      <div class="pd-section-title">description</div>
      <div class="pd-desc">${project.description}</div>
    </div>
    ` : ''}

    <div class="pd-section">
      <div class="pd-section-title">metadata</div>
      <div class="pd-meta-grid">
        <div class="pd-meta-item">
          <span class="pd-meta-label">status</span>
          ${project.status}
        </div>
        <div class="pd-meta-item">
          <span class="pd-meta-label">category</span>
          ${project.category}
        </div>
        <div class="pd-meta-item">
          <span class="pd-meta-label">last activity</span>
          ${relativeTime(project.last_activity)}
        </div>
        <div class="pd-meta-item">
          <span class="pd-meta-label">total files</span>
          ${project.total_files}
        </div>
        <div class="pd-meta-item">
          <span class="pd-meta-label">disk path</span>
          ${project.path}
        </div>
        <div class="pd-meta-item">
          <span class="pd-meta-label">artifacts</span>
          ${project.artifacts.length}
        </div>
      </div>
    </div>

    <div class="pd-section">
      <div class="pd-section-title">artifacts (${project.artifacts.length})</div>
      ${artifactsHtml}
    </div>
  `;

  overlay.appendChild(detail);
  document.body.appendChild(overlay);

  // Close handlers
  const closeBtn = detail.querySelector('.pd-close');
  if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
