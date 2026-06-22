/**
 * grainworks Pipeline Viz v0.6
 * Live pipeline visualization overlay — animated DAG with real-time task flow.
 * Polls route-activity.json every 5s. Zero dependencies. ES6 module.
 *
 * Import: import { renderPipelineViz } from './js/pipeline-viz.js';
 */

let activityData = null;
let pollInterval = null;
let tooltipEl = null;

/**
 * Build an SVG-based pipeline visualization from routes data + live activity.
 */
function buildViz(container, routesData) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 800 600');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Defs for gradients and markers
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

  // Pulse gradient for active edges
  const pulseGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  pulseGrad.setAttribute('id', 'pulseGrad');
  pulseGrad.setAttribute('x1', '0%');
  pulseGrad.setAttribute('y1', '0%');
  pulseGrad.setAttribute('x2', '100%');
  pulseGrad.setAttribute('y2', '0%');
  const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', 'var(--accent)');
  stop1.setAttribute('stop-opacity', '0.1');
  const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop2.setAttribute('offset', '50%');
  stop2.setAttribute('stop-color', 'var(--accent)');
  stop2.setAttribute('stop-opacity', '1');
  const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop3.setAttribute('offset', '100%');
  stop3.setAttribute('stop-color', 'var(--accent)');
  stop3.setAttribute('stop-opacity', '0.1');
  pulseGrad.appendChild(stop1);
  pulseGrad.appendChild(stop2);
  pulseGrad.appendChild(stop3);
  defs.appendChild(pulseGrad);

  // Arrow marker
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'pvArrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  arrowPath.setAttribute('fill', '#444');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);

  svg.appendChild(defs);

  const groups = Object.keys(routesData);
  const ySpacing = 90;
  const xSpacing = 200;
  const nodeW = 180;
  const nodeH = 50;
  let svgH = 80;
  const nodes = [];

  // Layout: groups as top row, domains as second row
  let y = 40;

  for (const g of groups) {
    const routes_g = routesData[g] || [];
    let x = 60;

    // Group label (top of column)
    const groupLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    groupLabel.setAttribute('x', String(x));
    groupLabel.setAttribute('y', String(y));
    groupLabel.setAttribute('font-size', '11');
    groupLabel.setAttribute('fill', g === 'operational' ? 'var(--accent)' : '#6699ff');
    groupLabel.setAttribute('font-weight', '600');
    groupLabel.setAttribute('text-transform', 'uppercase');
    groupLabel.setAttribute('letter-spacing', '1');
    groupLabel.textContent = g;
    svg.appendChild(groupLabel);

    // Connecting line from group label to first domain
    const lineStartY = y + 12;

    for (const r of routes_g) {
      if (!r || !r.domain) continue;
      const domainY = lineStartY + 40;

      // Domain background rect
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(domainY));
      rect.setAttribute('width', String(nodeW));
      rect.setAttribute('height', String(nodeH));
      rect.setAttribute('rx', '6');
      rect.setAttribute('ry', '6');
      rect.setAttribute('fill', 'var(--bg-panel)');
      rect.setAttribute('stroke', g === 'operational' ? 'var(--accent-dim)' : '#4466aa');
      rect.setAttribute('stroke-width', '1.5');
      rect.setAttribute('data-domain', r.domain);
      rect.classList.add('pv-node-rect');
      svg.appendChild(rect);

      // Domain label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x + nodeW / 2));
      label.setAttribute('y', String(domainY + nodeH / 2 - 4));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.setAttribute('font-size', '12');
      label.setAttribute('fill', 'var(--fg)');
      label.setAttribute('font-weight', '600');
      label.textContent = r.domain;
      svg.appendChild(label);

      // Agent name (small, under domain label)
      const agentLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      agentLabel.setAttribute('x', String(x + nodeW / 2));
      agentLabel.setAttribute('y', String(domainY + nodeH / 2 + 12));
      agentLabel.setAttribute('text-anchor', 'middle');
      agentLabel.setAttribute('dominant-baseline', 'central');
      agentLabel.setAttribute('font-size', '9');
      agentLabel.setAttribute('fill', 'var(--fg-dim)');
      agentLabel.textContent = r.agent || '—';
      svg.appendChild(agentLabel);

      // Status dot (top-right of node rect)
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const dotX = x + nodeW - 10;
      const dotY = domainY + 10;
      dot.setAttribute('cx', String(dotX));
      dot.setAttribute('cy', String(dotY));
      dot.setAttribute('r', '5');
      dot.setAttribute('fill', '#555');
      dot.setAttribute('data-domain', r.domain);
      dot.classList.add('pv-status-dot');
      svg.appendChild(dot);

      // Task count badge (bottom-right of node rect)
      const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badge.setAttribute('x', String(x + nodeW - 8));
      badge.setAttribute('y', String(domainY + nodeH - 6));
      badge.setAttribute('text-anchor', 'end');
      badge.setAttribute('font-size', '9');
      badge.setAttribute('fill', 'var(--fg-dim)');
      badge.setAttribute('data-domain', r.domain);
      badge.classList.add('pv-badge');
      badge.textContent = '0';
      svg.appendChild(badge);

      // Invisible click target (full rect)
      const clickTarget = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      clickTarget.setAttribute('x', String(x));
      clickTarget.setAttribute('y', String(domainY));
      clickTarget.setAttribute('width', String(nodeW));
      clickTarget.setAttribute('height', String(nodeH));
      clickTarget.setAttribute('fill', 'transparent');
      clickTarget.setAttribute('data-domain', r.domain);
      clickTarget.classList.add('pv-click-target');
      clickTarget.style.cursor = 'pointer';
      clickTarget.addEventListener('click', () => showDrillPanel(r.domain, activityData));
      clickTarget.addEventListener('mouseenter', (e) => showTooltip(e, r, r.domain));
      clickTarget.addEventListener('mousemove', moveTooltip);
      clickTarget.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(clickTarget);

      // Connecting edge from group label to this domain
      const edgeY1 = lineStartY;
      const edgeY2 = domainY;
      const midX = x + nodeW / 2;
      const edgePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const edgeD = `M ${midX} ${edgeY1} L ${midX} ${edgeY2}`;
      edgePath.setAttribute('d', edgeD);
      edgePath.setAttribute('fill', 'none');
      edgePath.setAttribute('stroke', '#444');
      edgePath.setAttribute('stroke-width', '1.5');
      edgePath.setAttribute('data-domain', r.domain);
      edgePath.classList.add('pv-edge');
      svg.appendChild(edgePath);

      nodes.push({
        x, y: domainY, w: nodeW, h: nodeH,
        domain: r.domain,
        group: g,
        agent: r.agent,
        keywords: r.keywords,
        edgeY1: lineStartY
      });

      x += xSpacing;
    }
    y += 80;
    svgH = Math.max(svgH, y + 80);
  }

  // SVG height
  svg.setAttribute('viewBox', `0 0 800 ${svgH}`);

  // Legend in bottom-left
  const legendY = svgH - 40;
  const legendX = 20;

  const legendBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  legendBg.setAttribute('x', String(legendX));
  legendBg.setAttribute('y', String(legendY - 8));
  legendBg.setAttribute('width', '200');
  legendBg.setAttribute('height', '24');
  legendBg.setAttribute('rx', '4');
  legendBg.setAttribute('fill', 'var(--bg-panel)');
  legendBg.setAttribute('stroke', 'var(--border)');
  legendBg.setAttribute('stroke-width', '1');
  svg.appendChild(legendBg);

  const legendDots = [
    { color: 'var(--accent)', label: 'active', x: legendX + 12 },
    { color: 'var(--warn)', label: 'busy', x: legendX + 68 },
    { color: 'var(--danger)', label: 'error', x: legendX + 118 },
    { color: '#555', label: 'idle', x: legendX + 168 },
  ];
  legendDots.forEach((d, i) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(d.x));
    circle.setAttribute('cy', String(legendY));
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', d.color);
    svg.appendChild(circle);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(d.x + 8));
    text.setAttribute('y', String(legendY + 4));
    text.setAttribute('font-size', '9');
    text.setAttribute('fill', 'var(--fg-dim)');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = d.label;
    svg.appendChild(text);
  });

  container.appendChild(svg);

  // Create tooltip
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    document.body.appendChild(tooltipEl);
  }

  return nodes;
}

/**
 * Update status dots, badges, and edge animations from route-activity.json.
 */
function updateFromActivity(nodes) {
  if (!activityData || !activityData.routes) {
    // Set all to idle gray
    document.querySelectorAll('.pv-status-dot').forEach(dot => {
      dot.setAttribute('fill', '#555');
    });
    document.querySelectorAll('.pv-badge').forEach(b => {
      b.textContent = '0';
    });
    document.querySelectorAll('.pv-edge').forEach(e => {
      e.classList.remove('pv-edge-active');
      e.setAttribute('stroke', '#444');
    });
    return;
  }

  const routes = activityData.routes;

  document.querySelectorAll('.pv-status-dot').forEach(dot => {
    const domain = dot.getAttribute('data-domain');
    const route = routes[domain];
    if (!route) {
      dot.setAttribute('fill', '#555');
      return;
    }
    switch (route.status) {
      case 'active':
        dot.setAttribute('fill', 'var(--accent)');
        dot.classList.add('pv-dot-pulse');
        break;
      case 'busy':
        dot.setAttribute('fill', 'var(--warn)');
        dot.classList.add('pv-dot-pulse');
        break;
      case 'error':
        dot.setAttribute('fill', 'var(--danger)');
        dot.classList.add('pv-dot-pulse');
        break;
      default:
        dot.setAttribute('fill', '#555');
        dot.classList.remove('pv-dot-pulse');
    }
  });

  // Badges: show queued + processing count
  document.querySelectorAll('.pv-badge').forEach(b => {
    const domain = b.getAttribute('data-domain');
    const route = routes[domain];
    if (!route) {
      b.textContent = '0';
      return;
    }
    const total = (route.queued || 0) + (route.processing || 0);
    if (total > 0) {
      b.textContent = String(total);
      b.classList.add('pv-badge-active');
      b.setAttribute('fill', total > 0 ? 'var(--accent)' : 'var(--fg-dim)');
    } else {
      b.textContent = '0';
      b.classList.remove('pv-badge-active');
      b.setAttribute('fill', 'var(--fg-dim)');
    }
  });

  // Edges: pulse when domain has activity
  document.querySelectorAll('.pv-edge').forEach(e => {
    const domain = e.getAttribute('data-domain');
    const route = routes[domain];
    if (route && (route.queued > 0 || route.processing > 0)) {
      e.classList.add('pv-edge-active');
      e.setAttribute('stroke', 'var(--accent)');
      e.setAttribute('stroke-width', '2.5');
    } else {
      e.classList.remove('pv-edge-active');
      e.setAttribute('stroke', '#444');
      e.setAttribute('stroke-width', '1.5');
    }
  });
}

/**
 * Poll route-activity.json every 5s.
 */
async function pollActivity(nodes) {
  try {
    const resp = await fetch('./data/route-activity.json?_=' + Date.now());
    if (resp.ok) {
      activityData = await resp.json();
    }
  } catch {
    // Server unreachable — keep previous data
  }
  if (activityData) {
    updateFromActivity(nodes);
  }
}

/* ── Tooltip ────────────────────────────── */

function showTooltip(e, routeData, domain) {
  if (!tooltipEl) return;
  const route = activityData?.routes?.[domain];
  const queued = route?.queued || 0;
  const processing = route?.processing || 0;
  const completed = route?.completed_today || 0;
  const status = route?.status || 'idle';
  tooltipEl.innerHTML = `
    <div><span class="tt-label">${domain}</span></div>
    <div class="tt-dim">agent: ${routeData.agent || '—'}</div>
    <div class="tt-dim">status: ${status} · queued: ${queued} · processing: ${processing}</div>
    <div class="tt-dim">completed today: ${completed} · keywords: ${(routeData.keywords || []).length}</div>
  `;
  tooltipEl.classList.add('visible');
  positionTooltip(e);
}

function moveTooltip(e) { positionTooltip(e); }
function hideTooltip() { if (tooltipEl) tooltipEl.classList.remove('visible'); }
function positionTooltip(e) {
  if (!tooltipEl) return;
  const x = e.clientX + 12;
  const y = e.clientY + 12;
  const maxX = window.innerWidth - tooltipEl.offsetWidth - 10;
  const maxY = window.innerHeight - tooltipEl.offsetHeight - 10;
  tooltipEl.style.left = Math.min(x, maxX) + 'px';
  tooltipEl.style.top = Math.min(y, maxY) + 'px';
}

/* ── Drill-Down Panel ──────────────────── */

function showDrillPanel(domain, activity) {
  const existing = document.querySelector('.pv-drill-overlay');
  if (existing) existing.remove();

  const route = activity?.routes?.[domain];
  const overlay = document.createElement('div');
  overlay.className = 'pv-drill-overlay';

  const panel = document.createElement('div');
  panel.className = 'pv-drill-panel';

  const status = route?.status || 'idle';
  const statusDot = status === 'active' ? '🟢' : status === 'busy' ? '🟡' : status === 'error' ? '🔴' : '⚫';
  const queued = route?.queued || 0;
  const processing = route?.processing || 0;
  const completed = route?.completed_today || 0;
  const taskIds = route?.active_task_ids || [];

  const taskListHtml = taskIds.length
    ? taskIds.map(id => `<div class="pv-drill-task">Task #${id}</div>`).join('')
    : '<div class="pv-drill-none">No active tasks</div>';

  panel.innerHTML = `
    <div class="pv-drill-header">
      <span class="pv-drill-title">${statusDot} ${domain}</span>
      <button class="pv-drill-close">✕</button>
    </div>

    <div class="pv-drill-body">
      <div class="pv-drill-section">
        <div class="pv-drill-section-title">status</div>
        <div class="pv-drill-metric-grid">
          <div class="pv-drill-metric">
            <span class="pv-drill-label">route status</span>
            <span class="pv-drill-value">${status}</span>
          </div>
          <div class="pv-drill-metric">
            <span class="pv-drill-label">queued</span>
            <span class="pv-drill-value">${queued}</span>
          </div>
          <div class="pv-drill-metric">
            <span class="pv-drill-label">processing</span>
            <span class="pv-drill-value">${processing}</span>
          </div>
          <div class="pv-drill-metric">
            <span class="pv-drill-label">completed today</span>
            <span class="pv-drill-value">${completed}</span>
          </div>
        </div>
      </div>

      <div class="pv-drill-section">
        <div class="pv-drill-section-title">active tasks</div>
        ${taskListHtml}
      </div>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  panel.querySelector('.pv-drill-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

/* ── Render Entry Point ────────────────── */

/**
 * Render the live pipeline visualization into a container.
 * @param {HTMLElement} container
 * @param {object} routesData - The routes.json data ({operational: [...], enterprise: [...]})
 */
export function renderPipelineViz(container, routesData) {
  container.innerHTML = '';

  if (!routesData || Object.keys(routesData).length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="big-icon">⚡</div>No route data — pipeline unavailable</div>';
    return;
  }

  // Inject inline styles once
  const styleId = 'pv-inline-styles';
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = pvStyles();
    document.head.appendChild(styleEl);
  }

  // Add loading state
  container.innerHTML = '<div class="empty-state"><div class="big-icon">◈</div>Loading pipeline activity…</div>';

  // Build the SVG
  const vizContainer = document.createElement('div');
  vizContainer.className = 'pv-viz-container';
  container.innerHTML = '';
  const nodes = buildViz(vizContainer, routesData);
  container.appendChild(vizContainer);

  // Initial activity poll
  pollActivity(nodes);

  // Clear existing poll interval
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => pollActivity(nodes), 5000);
}

/* ── Cleanup ────────────────────────────── */

/**
 * Stop the polling interval. Call when switching away from pipeline view.
 */
export function stopPipelineViz() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/* ── Inline CSS ─────────────────────────── */

function pvStyles() {
  return `
.pv-viz-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
  position: relative;
}

.pv-viz-container svg {
  width: 100%;
  height: 100%;
}

/* Status dot pulse animation */
.pv-dot-pulse {
  animation: pv-pulse 2s ease-in-out infinite;
}

@keyframes pv-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* Active edge animation (traveling glow) */
.pv-edge-active {
  stroke-dasharray: 8, 4;
  animation: pv-edge-flow 1s linear infinite;
}

@keyframes pv-edge-flow {
  0% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -24; }
}

/* Badge highlight when tasks present */
.pv-badge-active {
  font-weight: 600;
  animation: pv-badge-pulse 3s ease-in-out infinite;
}

@keyframes pv-badge-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

/* Node rect hover */
.pv-click-target:hover + .pv-node-rect,
.pv-node-rect:hover {
  stroke-width: 2.5;
  filter: brightness(1.1);
}

/* ── Drill-Down Panel ──────────────────── */

.pv-drill-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.6);
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}

.pv-drill-panel {
  width: 380px;
  max-width: 90vw;
  background: var(--bg-alt);
  border-left: 1px solid var(--border);
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  animation: pv-slideIn 0.15s ease-out;
}

@keyframes pv-slideIn {
  from { transform: translateX(30px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.pv-drill-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.pv-drill-close {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--fg-dim);
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  font-family: var(--font-mono);
  margin-left: auto;
}

.pv-drill-close:hover {
  border-color: var(--fg-dim);
  color: var(--fg);
}

.pv-drill-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
}

.pv-drill-section {
  margin-bottom: 18px;
}

.pv-drill-section-title {
  font-size: 10px;
  color: var(--fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}

.pv-drill-metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.pv-drill-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pv-drill-label {
  font-size: 9px;
  color: var(--fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.pv-drill-value {
  font-size: 13px;
  color: var(--fg);
  font-weight: 600;
}

.pv-drill-task {
  font-size: 11px;
  color: var(--fg);
  padding: 6px 10px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 4px;
}

.pv-drill-none {
  font-size: 11px;
  color: var(--fg-dim);
  font-style: italic;
}
`;
}
