/**
 * Network 3D Tab — Interactive force-directed graph of contacts, companies, and projects.
 *
 * Uses 3d-force-graph (vasturiano) loaded from CDN.
 * Three node types: person, company, project — color/size coded.
 * Click a node to slide in the detail panel.
 * Drag nodes, orbit, zoom with mouse.
 */

// ── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  person: '#6699ff',
  person_dim: 'rgba(102, 153, 255, 0.6)',
  company: '#ffcc44',
  company_dim: 'rgba(255, 204, 68, 0.6)',
  project: '#00cc66',
  project_dim: 'rgba(0, 204, 102, 0.6)',
  spec_goal: '#ff8844',
  spec_goal_dim: 'rgba(255, 136, 68, 0.6)',
  account_tier: '#cc66ff',
  account_tier_dim: 'rgba(204, 102, 255, 0.6)',
  link: 'rgba(255, 255, 255, 0.12)',
  link_project: 'rgba(0, 204, 102, 0.25)',
  link_company: 'rgba(255, 204, 68, 0.2)',
  bg: '#0c0c0c',
};

const TYPE_LABELS = {
  person: 'person',
  company: 'company',
  project: 'project',
};

const CATEGORY_LABELS = {
  spec_goal: 'spec target',
  account_tier: 'account tier',
  project: 'project',
};

// ── State ──────────────────────────────────────────────────────────────────

let graphData = null;
let ForceGraph = null; // Will hold the 3D instance
let forceGraphEl = null;

// ── Fetch ──────────────────────────────────────────────────────────────────

async function fetchGraph() {
  try {
    const resp = await fetch('./data/network-graph.json?_=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch {
    return null;
  }
}

// ── Node Color ─────────────────────────────────────────────────────────────

function nodeColor(n) {
  switch (n.type) {
    case 'person': return COLORS.person;
    case 'company': return COLORS.company;
    case 'project':
      if (n.category === 'spec_goal') return COLORS.spec_goal;
      if (n.category === 'account_tier') return COLORS.account_tier;
      return COLORS.project;
    default: return '#888';
  }
}

function nodeDimColor(n) {
  switch (n.type) {
    case 'person': return COLORS.person_dim;
    case 'company': return COLORS.company_dim;
    case 'project':
      if (n.category === 'spec_goal') return COLORS.spec_goal_dim;
      if (n.category === 'account_tier') return COLORS.account_tier_dim;
      return COLORS.project_dim;
    default: return 'rgba(136,136,136,0.5)';
  }
}

// ── Render ─────────────────────────────────────────────────────────────────

export async function renderNetwork3D(container) {
  container.innerHTML = '';

  // Ensure 3d-force-graph is loaded
  if (typeof ForceGraph3D === 'undefined') {
    container.innerHTML = '<div class="empty-state"><div class="big-icon">⟐</div>Loading 3D renderer...</div>';
    await loadScript('https://unpkg.com/3d-force-graph@1');
    // Need d3-force-3d loaded as well
    if (typeof ForceGraph3D === 'undefined') {
      await loadScript('https://unpkg.com/3d-force-graph@1/dist/3d-force-graph.min.js');
    }
  }

  if (!graphData) {
    graphData = await fetchGraph();
  }

  if (!graphData || !graphData.nodes || !graphData.nodes.length) {
    container.innerHTML = '<div class="empty-state"><div class="big-icon">⟐</div>No network data</div>';
    return;
  }

  // Build the info bar
  const infoBar = document.createElement('div');
  infoBar.className = 'ng-info-bar';
  infoBar.innerHTML = `
    <span class="ng-info-title">⟐ network &mdash; <span class="ng-count">${graphData.nodes.length}</span> nodes, <span class="ng-count">${graphData.links.length}</span> links</span>
    <span class="ng-legend">
      <span class="ng-legend-item"><span class="ng-dot" style="background:${COLORS.person}"></span> person</span>
      <span class="ng-legend-item"><span class="ng-dot" style="background:${COLORS.company}"></span> company</span>
      <span class="ng-legend-item"><span class="ng-dot" style="background:${COLORS.project}"></span> project</span>
      <span class="ng-legend-item"><span class="ng-dot" style="background:${COLORS.spec_goal}"></span> spec goal</span>
      <span class="ng-legend-item"><span class="ng-dot" style="background:${COLORS.account_tier}"></span> account tier</span>
    </span>
  `;
  container.appendChild(infoBar);

  // Container for the graph
  const graphContainer = document.createElement('div');
  graphContainer.id = 'ng-3d-container';
  graphContainer.style.cssText = 'flex:1;position:relative;';
  container.appendChild(graphContainer);

  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'ng-tooltip';
  tooltip.style.cssText = 'position:absolute;display:none;pointer-events:none;z-index:50;background:rgba(12,12,12,0.92);border:1px solid #333;border-radius:4px;padding:8px 12px;font-size:12px;white-space:nowrap;';
  graphContainer.appendChild(tooltip);

  // Detail panel overlay
  const detailOverlay = document.createElement('div');
  detailOverlay.className = 'ng-detail-overlay';
  detailOverlay.style.display = 'none';
  detailOverlay.innerHTML = `
    <div class="ng-detail">
      <div class="ng-detail-header">
        <span class="ng-detail-type-badge" id="ng-detail-badge"></span>
        <span class="ng-detail-close" id="ng-detail-close">✕</span>
      </div>
      <div class="ng-detail-name" id="ng-detail-name"></div>
      <div class="ng-detail-title" id="ng-detail-title"></div>
      <div class="ng-detail-section" id="ng-detail-links"></div>
    </div>
  `;
  document.body.appendChild(detailOverlay);

  document.getElementById('ng-detail-close').addEventListener('click', () => {
    detailOverlay.style.display = 'none';
  });
  detailOverlay.addEventListener('click', (e) => {
    if (e.target === detailOverlay) detailOverlay.style.display = 'none';
  });

  // Create the ForceGraph instance
  const width = graphContainer.clientWidth || 800;
  const height = graphContainer.clientHeight || 500;

  const Graph = ForceGraph3D({
    controlType: 'orbit',
    rendererConfig: {
      antialias: true,
      alpha: true,
      backgroundColor: COLORS.bg,
    },
  })(graphContainer)
    .graphData(graphData)
    .nodeId('id')
    .nodeVal(n => Math.max(n.size || 1, 0.5))
    .nodeColor(nodeColor)
    .nodeLabel(n => `${n.name}${n.title ? ' — ' + n.title : ''}`)
    .nodeThreeObject(n => {
      // Simple sphere geometry
      const geometry = new THREE.SphereGeometry(Math.max(n.size || 1, 0.5), 16, 16);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(nodeColor(n)),
        metalness: 0.3,
        roughness: 0.6,
      });
      return new THREE.Mesh(geometry, material);
    })
    .linkColor(l => {
      if (l.type === 'on_project') return COLORS.link_project;
      if (l.type === 'involved_in') return COLORS.link_company;
      return COLORS.link;
    })
    .linkWidth(l => Math.min((l.weight || 1) * 0.5, 2))
    .linkOpacity(0.3)
    .linkDirectionalParticles(1)
    .linkDirectionalParticleSpeed(0.005)
    .linkDirectionalParticleColor(() => '#00cc66')
    .backgroundColor(COLORS.bg)
    .width(width)
    .height(height)
    .d3AlphaDecay(0.02)
    .d3VelocityDecay(0.3)
    .warmupTicks(100)
    .cooldownTicks(50)
    .onNodeClick(n => showDetail(n, detailOverlay, graphData))
    .onNodeHover(n => {
      const tip = document.getElementById('ng-tooltip');
      if (!tip) return;
      if (n) {
        tip.textContent = n.name + (n.title ? ' — ' + n.title : '');
        tip.style.display = 'block';
      } else {
        tip.style.display = 'none';
      }
    });

  // Track mouse for tooltip positioning
  graphContainer.addEventListener('mousemove', (e) => {
    const tip = document.getElementById('ng-tooltip');
    if (!tip || tip.style.display === 'none') return;
    const rect = graphContainer.getBoundingClientRect();
    tip.style.left = (e.clientX - rect.left + 12) + 'px';
    tip.style.top = (e.clientY - rect.top - 10) + 'px';
  });

  // Resize handler
  const onResize = () => {
    const w = graphContainer.clientWidth;
    const h = graphContainer.clientHeight;
    if (w > 0 && h > 0) {
      Graph.width(w);
      Graph.height(h);
    }
  };
  window.addEventListener('resize', onResize);

  // Cleanup function stored on container
  container._network3dCleanup = () => {
    window.removeEventListener('resize', onResize);
    if (Graph) {
      Graph._destructor && Graph._destructor();
    }
    detailOverlay.remove();
  };
}

// ── Detail Panel ───────────────────────────────────────────────────────────

function showDetail(node, overlay, graphData) {
  const links = graphData.links.filter(l => l.source === node.id || l.target === node.id);

  const badge = document.getElementById('ng-detail-badge');
  const nameEl = document.getElementById('ng-detail-name');
  const titleEl = document.getElementById('ng-detail-title');
  const linksEl = document.getElementById('ng-detail-links');

  // Badge
  let typeLabel = TYPE_LABELS[node.type] || node.type;
  if (node.type === 'project' && CATEGORY_LABELS[node.category]) {
    typeLabel = CATEGORY_LABELS[node.category];
  }
  badge.textContent = typeLabel;
  badge.style.background = nodeDimColor(node);

  // Name
  nameEl.textContent = node.name;

  // Title / company subtitle
  if (node.title) {
    titleEl.textContent = node.title;
    titleEl.style.display = 'block';
  } else {
    titleEl.style.display = 'none';
  }

  // Connected nodes
  if (links.length === 0) {
    linksEl.innerHTML = '<div class="ng-detail-empty">No connections</div>';
  } else {
    let html = `<div class="ng-detail-section-title">${links.length} connection${links.length !== 1 ? 's' : ''}</div>`;
    for (const l of links) {
      const otherId = l.source === node.id ? l.target : l.source;
      const other = graphData.nodes.find(n => n.id === otherId);
      if (!other) continue;

      let linkLabel = '';
      switch (l.type) {
        case 'works_at': linkLabel = 'works at'; break;
        case 'on_project': linkLabel = 'project'; break;
        case 'involved_in': linkLabel = 'firm involved'; break;
        default: linkLabel = l.type;
      }

      html += `<div class="ng-detail-link-row">
        <span class="ng-detail-link-dot" style="background:${nodeDimColor(other)}"></span>
        <span class="ng-detail-link-name">${other.name}</span>
        <span class="ng-detail-link-type">${linkLabel}</span>
      </div>`;
    }
    linksEl.innerHTML = html;
  }

  overlay.style.display = 'flex';
}


// ── Helper: Load Script ────────────────────────────────────────────────────

function loadScript(url) {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (url.includes('3d-force-graph') && typeof ForceGraph3D !== 'undefined') {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
