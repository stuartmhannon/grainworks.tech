/**
 * library-panel.js — workbench v0.4 unified library browser.
 *
 * Fetches library/index.json (compact search index) and items.json (full metadata),
 * renders a searchable, filterable card grid with per-type detail panels.
 *
 * Types indexed: audiobook, music, movie, tv, concert, ebook,
 *                research, skill, idea, contact, fact
 *
 * Import: import { renderLibrary } from './js/library-panel.js';
 */

import { relativeTime } from './shared-utils.js';

/* ── Data ──────────────────────────────────── */
let itemsCache = null;
let activeFacets = new Set();
let activeSubnav = 'all';
let searchTerm = '';

const TYPE_LABELS = {
  audiobook: 'Audiobook', music: 'Music', movie: 'Movie',
  tv: 'TV', concert: 'Concert', ebook: 'eBook',
  research: 'Research', skill: 'Skill', idea: 'Idea',
  contact: 'Contact', fact: 'Fact',
};

const TYPE_ICONS = {
  audiobook: '🎧', music: '🎵', movie: '🎬',
  tv: '📺', concert: '🎤', ebook: '📖',
  research: '📄', skill: '🔧', idea: '💡',
  contact: '👤', fact: '🧠',
};

const SUBCAT_MAP = {
  audiobook: 'media', music: 'media', movie: 'media',
  tv: 'media', concert: 'media', ebook: 'media',
  research: 'knowledge', skill: 'knowledge', idea: 'knowledge',
  contact: 'intel', fact: 'intel',
};


function fmtSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return Math.round(bytes / 1024) + 'KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + 'MB';
  return (bytes / 1073741824).toFixed(1) + 'GB';
}

async function fetchIndex() {
  try {
    const resp = await fetch('./data/library/index.json?_=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch {
    return null;
  }
}

async function fetchItems() {
  try {
    const resp = await fetch('./data/library/items.json?_=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Main entry point — render the library tab.
 */
export async function renderLibrary(container) {
  container.innerHTML = '<div class="lib-loading"><div class="big-icon">◐</div>loading library index...</div>';

  // Fetch data
  const idxData = await fetchIndex();
  if (!idxData || !idxData.items || idxData.items.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="big-icon">⚠</div>No library data — run the library collector first</div>';
    return;
  }

  // Fetch full items for detail panels
  const fullData = await fetchItems();
  if (fullData && fullData.items) {
    itemsCache = fullData.items;
  }

  indexCache = idxData.items;

  // Build the UI
  container.innerHTML = `
    <div class="lib-topbar">
      <div class="lib-search">
        <span class="search-icon">◐</span>
        <input type="text" id="lib-search-input" placeholder="search ${indexCache.length} items..." spellcheck="false">
      </div>
    </div>
    <div class="lib-facets" id="lib-facets"></div>
    <div class="lib-subnav" id="lib-subnav"></div>
    <div class="lib-results-info" id="lib-results-info"></div>
    <div class="lib-results" id="lib-results"></div>
  `;

  // Build facets
  renderFacets(container);
  // Build subnav
  renderSubnav(container);
  // Render results
  renderResults(container);
  // Wire events (one-time, survives re-renders)
  wireFacetEvents(container);
  wireSubnavEvents(container);

  // Wire search input
  const searchInput = container.querySelector('#lib-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchTerm = searchInput.value.toLowerCase().trim();
      renderResults(container);
    });
    // Debounced focus
    setTimeout(() => searchInput.focus(), 100);
  }
}

function renderFacets(container) {
  const facetContainer = container.querySelector('#lib-facets');
  if (!facetContainer) return;

  // Count by type
  const counts = {};
  for (const item of indexCache) {
    const type = item.y || 'unknown';
    counts[type] = (counts[type] || 0) + 1;
  }

  // Sort: media types first, then knowledge, then intel
  const order = ['audiobook', 'music', 'movie', 'tv', 'concert', 'ebook',
                 'research', 'skill', 'idea', 'contact', 'fact'];

  let html = '<button class="lib-facet-pill' + (activeFacets.size === 0 ? ' active' : '') +
    '" data-facet="all"><span class="facet-count">' + indexCache.length + '</span> all</button>';

  for (const type of order) {
    if (!counts[type]) continue;
    const active = activeFacets.has(type) ? ' active' : '';
    const label = TYPE_LABELS[type] || type;
    html += `<button class="lib-facet-pill${active}" data-facet="${type}">${label} <span class="facet-count">${counts[type]}</span></button>`;
  }

  facetContainer.innerHTML = html;
}

function wireFacetEvents(container) {
  const facetContainer = container.querySelector('#lib-facets');
  if (!facetContainer) return;
  // Wire clicks — remove old listener first, add fresh one
  const handler = (e) => {
    const btn = e.target.closest('.lib-facet-pill');
    if (!btn) return;
    const facet = btn.dataset.facet;

    if (facet === 'all') {
      activeFacets.clear();
    } else if (activeFacets.has(facet)) {
      activeFacets.delete(facet);
    } else {
      activeFacets.add(facet);
    }

    renderFacets(container);
    renderResults(container);
  };
  // Only wire once — removeEventListener is not needed since wireFacetEvents
  // is called exactly once from renderLibrary
  if (!facetContainer._facetWired) {
    facetContainer.addEventListener('click', handler);
    facetContainer._facetWired = true;
  }
}

function renderSubnav(container) {
  const navContainer = container.querySelector('#lib-subnav');
  if (!navContainer) return;

  const sections = [
    { id: 'all', label: 'all' },
    { id: 'media', label: 'media' },
    { id: 'knowledge', label: 'knowledge' },
    { id: 'intel', label: 'intelligence' },
  ];

  let html = '';
  for (const s of sections) {
    const active = activeSubnav === s.id ? ' active' : '';
    html += `<div class="lib-subnav-item${active}" data-subnav="${s.id}">${s.label}</div>`;
  }
  navContainer.innerHTML = html;

  // Wire events are handled by wireSubnavEvents called from renderLibrary
}

function wireSubnavEvents(container) {
  const navContainer = container.querySelector('#lib-subnav');
  if (!navContainer) return;
  const handler = (e) => {
    const item = e.target.closest('.lib-subnav-item');
    if (!item) return;
    activeSubnav = item.dataset.subnav;
    renderSubnav(container);
    renderResults(container);
  };
  if (!navContainer._subnavWired) {
    navContainer.addEventListener('click', handler);
    navContainer._subnavWired = true;
  }
}

function getFilteredItems() {
  let items = indexCache;

  // Subnav filter
  if (activeSubnav !== 'all') {
    items = items.filter(item => {
      const cat = SUBCAT_MAP[item.y];
      return cat === activeSubnav;
    });
  }

  // Facet filter
  if (activeFacets.size > 0) {
    items = items.filter(item => activeFacets.has(item.y));
  }

  // Search filter
  if (searchTerm) {
    items = items.filter(item => {
      const title = (item.t || '').toLowerCase();
      const author = (item.a || '').toLowerCase();
      const summary = (item.s || '').toLowerCase();
      const tags = (item.tg || []).join(' ').toLowerCase();
      return title.includes(searchTerm) || author.includes(searchTerm) ||
             summary.includes(searchTerm) || tags.includes(searchTerm);
    });
  }

  return items;
}

function renderResults(container) {
  const resultsContainer = container.querySelector('#lib-results');
  const infoContainer = container.querySelector('#lib-results-info');
  if (!resultsContainer) return;

  const items = getFilteredItems();
  const total = indexCache.length;
  const shown = items.length;

  // Info line
  if (infoContainer) {
    if (searchTerm || activeFacets.size > 0 || activeSubnav !== 'all') {
      infoContainer.textContent = `${shown} of ${total} items`;
    } else {
      infoContainer.textContent = `${total} items`;
    }
  }

  if (items.length === 0) {
    resultsContainer.innerHTML = '<div class="empty-state"><div class="big-icon">◐</div>no matches</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'lib-grid';

  // Cap visible items at 50, show more link
  var libExpanded = window._libExpanded || false;
  var SHOW_MAX = 50;
  var showItems = (items.length > SHOW_MAX && !libExpanded) ? items.slice(0, SHOW_MAX) : items;

  for (const item of showItems) {
    const type = item.y || 'unknown';
    const badgeClass = 'badge-' + type;
    const icon = TYPE_ICONS[type] || '◐';
    const author = item.a || '';
    const sizeLabel = item.sz || '';
    const title = item.t || 'Untitled';

    const card = document.createElement('div');
    card.className = 'lib-card';
    card.dataset.id = item.id;
    card.innerHTML = `
      <span class="lc-badge ${badgeClass}">${icon} ${TYPE_LABELS[type] || type}</span>
      <div class="lc-title">${escHtml(title)}</div>
      ${author ? `<div class="lc-author">${escHtml(author)}</div>` : ''}
      <div class="lc-meta">
        ${sizeLabel ? `<span class="lc-size">${sizeLabel}</span>` : ''}
      </div>
    `;

    card.addEventListener('click', () => showDetail(item, container));
    grid.appendChild(card);
  }

  // "Show all N items" link
  if (items.length > SHOW_MAX && !libExpanded) {
    const moreBtn = document.createElement('div');
    moreBtn.style.cssText = 'text-align:center;padding:12px;cursor:pointer;color:var(--accent);font-size:11px;grid-column:1 / -1;';
    moreBtn.textContent = 'Show all ' + items.length + ' items ▾';
    moreBtn.addEventListener('click', function() {
      window._libExpanded = true;
      renderResults(container);
    });
    grid.appendChild(moreBtn);
  }

  resultsContainer.innerHTML = '';
  resultsContainer.appendChild(grid);
}

function showDetail(idxItem, container) {
  // Find full item data from itemsCache
  let full = null;
  if (itemsCache) {
    full = itemsCache.find(i => i.id === idxItem.id);
  }
  const item = full || idxItem;

  const type = item.type || item.y || 'unknown';
  const badgeClass = 'badge-' + type;
  const icon = TYPE_ICONS[type] || '◐';
  const title = item.title || item.t || 'Untitled';
  const author = item.author || item.a || '';
  const summary = item.summary || item.s || '';
  const size = item.size || 0;
  const sizeLabelFull = item.size_label || item.sz || fmtSize(size);
  const tags = item.tags || item.tg || [];
  const path = item.path || '';
  const trust = item.trust;
  const created = item.created || '';

  // Build type-specific meta grid
  let metaHtml = '';
  const itemType = type;

  if (itemType === 'audiobook') {
    if (author) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">author</span>${escHtml(author)}</div>`;
    const narrator = item.narrator || item.nr || '';
    if (narrator) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">narrator</span>${escHtml(narrator)}</div>`;
    const duration = item.duration || item.dur || '';
    if (duration) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">duration</span>${escHtml(duration)}</div>`;
    if (sizeLabelFull) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">size</span>${sizeLabelFull}</div>`;

  } else if (itemType === 'skill') {
    if (author) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">author</span>${escHtml(author)}</div>`;
    const category = item.category || item.cat || '';
    if (category) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">category</span>${escHtml(category)}</div>`;

  } else if (itemType === 'fact') {
    const entity = item.entity || item.e || '';
    if (entity) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">entity</span>${escHtml(entity)}</div>`;
    const source = item.source || '';
    if (trust !== undefined && trust !== null) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">trust score</span>${Math.round(trust * 100)}%</div>`;
    if (source) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">source</span>${escHtml(source)}</div>`;

  } else if (itemType === 'contact') {
    const company = item.company || item.co || '';
    if (company) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">company</span>${escHtml(company)}</div>`;
    const contactTitle = item.title || item.role || '';
    if (contactTitle) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">title</span>${escHtml(contactTitle)}</div>`;
    const linkedin = item.linkedin || item.li || '';
    if (linkedin) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">linkedin</span><a href="${escHtml(linkedin)}" target="_blank" rel="noopener" class="ld-link">${escHtml(linkedin.replace(/^https?:\/\//, ''))}</a></div>`;

  } else if (itemType === 'idea') {
    const date = item.date || item.created || '';
    if (date) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">date</span>${escHtml(date)}</div>`;

  } else {
    // Generic fallback for all other types
    if (author) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">author</span>${escHtml(author)}</div>`;
    if (sizeLabelFull) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">size</span>${sizeLabelFull}</div>`;
    if (item.subtype) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">type</span>${item.subtype}</div>`;
    if (created) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">added</span>${relativeTime(created)}</div>`;
    if (trust !== undefined && trust !== null) metaHtml += `<div class="ld-meta-item"><span class="ld-meta-label">trust</span>${Math.round(trust * 100)}%</div>`;
  }

  // Tags
  const tagHtml = tags.filter(t => t).slice(0, 15).map(t =>
    `<span class="ld-tag">${escHtml(t)}</span>`
  ).join('');

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'lib-detail-overlay';
  overlay.innerHTML = `
    <div class="lib-detail">
      <div class="ld-header">
        <button class="ld-close">✕</button>
        <div class="ld-title">
          <span class="lc-badge ${badgeClass}" style="position:relative;top:auto;right:auto;display:inline-block;margin-right:6px;">${icon} ${TYPE_LABELS[type] || type}</span>
          ${escHtml(title)}
        </div>
      </div>
      ${metaHtml ? `<div class="ld-section"><div class="ld-section-title">metadata</div><div class="ld-meta-grid">${metaHtml}</div></div>` : ''}
      ${summary ? `<div class="ld-section"><div class="ld-section-title">summary</div><div class="ld-summary">${escHtml(summary)}</div></div>` : ''}
      ${tagHtml ? `<div class="ld-section"><div class="ld-section-title">tags</div><div class="ld-tags">${tagHtml}</div></div>` : ''}
      ${path ? `<div class="ld-section"><div class="ld-section-title">path</div><div class="ld-value" style="font-family:var(--font-mono);font-size:10px;color:var(--fg-dim);word-break:break-all;">${escHtml(path)}</div></div>` : ''}
    </div>
  `;

  document.body.appendChild(overlay);
  const closeBtn = overlay.querySelector('.ld-close');
  if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function escHtml(s) {
  if (typeof s !== 'string') return String(s || '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
