/**
 * grainworks DAG Renderer
 * Renders orchestrator routing topology as an interactive SVG graph.
 * Also supports live pipeline visualization mode (polling route-activity.json).
 * Zero dependencies. ES6 module.
 */

const COLORS = {
  operational: '#00cc66',
  enterprise:  '#6699ff',
  fallback:    '#808080',
  edge:        '#333',
  edgeHi:      '#00cc66',
};

let tooltipEl = null;
let dimTimeout = null;

/* ── Live pipeline viz state ─────────────── */

let activityData = null;
let pollInterval = null;

/**
 * Build a layered layout: group → domain → agent
 */
function layout(routes) {
  const nodes = [];
  const edges = [];
  const groups = Object.keys(routes);
  const ySpacing = 80;
  const xSpacing = 180;
  const nodeW = 170;
  const nodeH = 44;
  let y = 40;

  // Group layer
  const groupNodes = {};
  for (const g of groups) {
    groupNodes[g] = { id: `group-${g}`, label: g, type: 'group', y, x: 20, w: nodeW, h: nodeH };
    nodes.push(groupNodes[g]);
    y += ySpacing;
  }

  // Reset y for domain layer
  y = 40;

  for (const g of groups) {
    const routes_g = routes[g] || [];
    const gNode = groupNodes[g];
    let x = 20 + xSpacing;

    for (const r of routes_g) {
      if (!r || !r.domain) continue;
      const domainId = `${g}-${r.domain}`;
      const agentId = `${g}-${r.domain}-agent`;

      // Domain node
      const dNode = {
        id: domainId,
        label: r.domain,
        type: 'domain',
        group: g,
        x, y,
        w: nodeW, h: 30,
        data: r
      };
      nodes.push(dNode);

      // Agent node (sub-node concept via tooltip, shown inline)
      const aNode = {
        id: agentId,
        label: r.agent || 'default',
        type: 'agent',
        domain: r.domain,
        group: g,
        x, y: y + 34,
        w: nodeW, h: 22,
        data: r
      };
      nodes.push(aNode);

      // Edges: group → domain, domain → agent
      edges.push({ from: gNode.id, to: domainId, label: '', group: g });
      edges.push({ from: domainId, to: agentId, label: String(r.priority || ''), group: g });

      x += xSpacing;
    }
    y += Math.max(routes_g.length, 1) * ySpacing;
  }

  return { nodes, edges, svgW: 20 + xSpacing * 3, svgH: y + 80 };
}

function makeId(prefix) {
  // Not needed since we use DOM directly
  return prefix + '-' + Math.random().toString(36).slice(2, 6);
}

/**
 * Render the DAG into a container element.
 * @param {HTMLElement} container
 * @param {object} routes - The routes.json data ({operational: [...], enterprise: [...]})
 * @param {object} [opts] - Options object
 * @param {boolean} [opts.live=false] - Enable live activity polling
 */
export function renderDAG(container, routes, opts = {}) {
  const live = opts.live === true;

  container.innerHTML = '';

  if (!routes || Object.keys(routes).length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="big-icon">⚡</div>No routes loaded</div>';
    return;
  }

  if (live) {
    // Live pipeline viz rendering
    renderLiveViz(container, routes);
    return;
  }

  /* ── Static DAG rendering ──────────────── */

  const { nodes, edges, svgW, svgH } = layout(routes);
  const pad = 20;
  const vw = svgW + pad * 2;
  const vh = Math.max(svgH + pad * 2, 400);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Defs for arrow markers
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrow');
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

  // Build lookup
  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);

  // Draw edges
  const edgeEls = [];
  edges.forEach((e, i) => {
    const from = nodeMap[e.from];
    const to = nodeMap[e.to];
    if (!from || !to) return;

    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    const cx = (x1 + x2) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
    path.setAttribute('d', d);
    path.setAttribute('class', 'dag-edge');
    path.setAttribute('data-edge', String(i));
    path.setAttribute('data-group', e.group);
    path.setAttribute('marker-end', 'url(#arrow)');
    svg.appendChild(path);
    edgeEls.push(path);

    // Edge label (for priority)
    if (e.label) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(cx));
      text.setAttribute('y', String((y1 + y2) / 2 - 6));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'dag-edge-label');
      text.setAttribute('data-edge-label', String(i));
      text.textContent = `p${e.label}`;
      svg.appendChild(text);
    }
  });

  // Draw nodes
  const nodeEls = [];
  nodes.forEach(n => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'dag-node');
    g.setAttribute('data-node', n.id);
    g.setAttribute('data-group', n.group || '');
    g.setAttribute('data-domain', n.domain || '');

    const isGroup = n.type === 'group';
    const isAgent = n.type === 'agent';
    const color = n.group ? COLORS[n.group] || COLORS.fallback : COLORS.fallback;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(n.x));
    rect.setAttribute('y', String(n.y));
    rect.setAttribute('width', String(n.w));
    rect.setAttribute('height', String(n.h));
    rect.setAttribute('rx', isGroup ? '8' : '4');
    rect.setAttribute('ry', isGroup ? '8' : '4');
    rect.setAttribute('fill', isAgent ? 'transparent' : (isGroup ? 'transparent' : 'var(--bg-panel)'));
    rect.setAttribute('stroke', color);
    rect.setAttribute('stroke-width', isGroup ? '1.5' : '1');
    rect.setAttribute('stroke-dasharray', isGroup ? '6,3' : 'none');
    g.appendChild(rect);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(n.x + n.w / 2));
    label.setAttribute('y', String(n.y + n.h / 2 + (isGroup ? 0 : 0)));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    if (isGroup) {
      label.setAttribute('font-size', '10');
      label.setAttribute('fill', color);
      label.setAttribute('text-transform', 'uppercase');
      label.setAttribute('letter-spacing', '1');
    } else if (isAgent) {
      label.setAttribute('font-size', '9');
      label.setAttribute('fill', 'var(--fg-dim)');
    } else {
      label.setAttribute('font-size', '11');
      label.setAttribute('fill', 'var(--fg)');
      label.setAttribute('font-weight', '600');
    }
    label.textContent = n.label;
    g.appendChild(label);

    // Keywords count badge on domain nodes
    if (n.type === 'domain' && n.data && n.data.keywords) {
      const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badge.setAttribute('x', String(n.x + n.w - 8));
      badge.setAttribute('y', String(n.y + n.h / 2));
      badge.setAttribute('text-anchor', 'end');
      badge.setAttribute('dominant-baseline', 'central');
      badge.setAttribute('font-size', '8');
      badge.setAttribute('fill', 'var(--fg-dim)');
      badge.textContent = `${n.data.keywords.length}k`;
      g.appendChild(badge);
    }

    // Click handler for highlight
    g.addEventListener('click', () => {
      highlightNode(n.id, nodes, edges, nodeEls, edgeEls);
    });

    // Hover tooltip on domain nodes
    if (n.type === 'domain' && n.data) {
      g.addEventListener('mouseenter', (e) => showTooltip(e, n));
      g.addEventListener('mousemove', moveTooltip);
      g.addEventListener('mouseleave', hideTooltip);
    }

    svg.appendChild(g);
    nodeEls.push(g);
  });

  container.appendChild(svg);

  // Tooltip element
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    document.body.appendChild(tooltipEl);
  }

  // Show total stats
  const totalEl = document.createElement('div');
  totalEl.style.cssText = 'position:absolute;bottom:12px;right:16px;font-size:10px;color:var(--fg-dim);font-family:var(--font-mono)';
  const total = nodes.filter(n => n.type === 'domain').length;
  totalEl.textContent = `${total} domains · ${edges.length} routes · ${Object.keys(routes).length} groups`;
  container.style.position = 'relative';
  container.appendChild(totalEl);
}

/* ── Live Pipeline Viz Rendering ────────── */

/**
 * Render the live pipeline visualization (animated DAG with status dots, badges, polling).
 */
function renderLiveViz(container, routesData) {
  const vizContainer = document.createElement('div');
  vizContainer.className = 'pv-container';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'pv-svg');
  svg.setAttribute('viewBox', '0 0 800 600');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Defs for gradient and markers
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
      clickTarget.addEventListener('mouseenter', (e) => showLiveTooltip(e, r, r.domain));
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

  vizContainer.appendChild(svg);

  // Tooltip element (reuse shared tooltipEl)
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    document.body.appendChild(tooltipEl);
  }

  container.appendChild(vizContainer);

  // Initial activity poll
  pollActivity(nodes);

  // Clear existing poll interval
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => pollActivity(nodes), 5000);
}

/* ── Live Activity Updates ──────────────── */

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
      dot.classList.remove('pv-dot-pulse');
      return;
    }
    const s = route.status;
    // Map backend statuses: green/active, yellow/busy, red/error, grey/green/idle
    const active = s === 'active' || s === 'green';
    const busy   = s === 'busy'   || s === 'yellow';
    const err    = s === 'error'  || s === 'red';
    if (active) {
      dot.setAttribute('fill', 'var(--accent)');
      dot.classList.add('pv-dot-pulse');
    } else if (busy) {
      dot.setAttribute('fill', 'var(--warn)');
      dot.classList.add('pv-dot-pulse');
    } else if (err) {
      dot.setAttribute('fill', 'var(--danger)');
      dot.classList.add('pv-dot-pulse');
    } else {
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
    if (route && (route.processing > 0 || route.queued > 0)) {
      e.classList.add('pv-edge-active');
      e.setAttribute('stroke', 'var(--accent)');
      e.setAttribute('stroke-width', '2.5');
    } else if (route && (route.status === 'active' || route.status === 'green' || route.status === 'yellow' || route.status === 'busy')) {
      e.classList.add('pv-edge-active');
      e.setAttribute('stroke', 'var(--accent-dim)');
      e.setAttribute('stroke-width', '2');
    } else {
      e.classList.remove('pv-edge-active');
      e.setAttribute('stroke', '#444');
      e.setAttribute('stroke-width', '1.5');
    }
  });
}

/**
 * Normalize backend activity data (domains array with task_ids + status)
 * into the lookup format expected by updateFromActivity.
 * Backend shape: { domains: [{ domain, group, agent, priority, keywords, task_ids, task_titles, status }], summary }
 */
function normalizeActivity(raw) {
  // If the data already has a 'routes' dict, use it as-is
  if (raw && raw.routes && typeof raw.routes === 'object') {
    return raw;
  }
  // Convert domains array → routes dict
  const routes = {};
  if (raw && Array.isArray(raw.domains)) {
    for (const d of raw.domains) {
      const queued = 0;           // not provided by backend directly
      const processing = d.task_ids ? d.task_ids.length : 0;
      const completed_today = 0;  // not provided by backend directly
      const active_task_ids = d.task_ids || [];
      routes[d.domain] = {
        status: d.status || 'grey',
        queued,
        processing,
        completed_today,
        active_task_ids,
        group: d.group,
        agent: d.agent,
        priority: d.priority,
        keywords: d.keywords,
        task_titles: d.task_titles || [],
      };
    }
  }
  return { routes, last_updated: raw?.last_updated };
}

/**
 * Poll route-activity.json every 5s.
 */
async function pollActivity(nodes) {
  try {
    const resp = await fetch('./data/route-activity.json?_=' + Date.now());
    if (resp.ok) {
      const raw = await resp.json();
      activityData = normalizeActivity(raw);
    }
  } catch {
    // Server unreachable — keep previous data
  }
  if (activityData) {
    updateFromActivity(nodes);
  }
}

/**
 * Stop the polling interval. Call when switching away from pipeline view.
 */
export function stopPipelineViz() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/* ── Highlight ──────────────────────────── */

function highlightNode(nodeId, nodes, edges, nodeEls, edgeEls) {
  // Find related node IDs
  const related = new Set();
  related.add(nodeId);

  edges.forEach(e => {
    if (e.from === nodeId) related.add(e.to);
    if (e.to === nodeId) related.add(e.from);
  });

  nodeEls.forEach((el, i) => {
    const id = nodes[i]?.id;
    el.classList.toggle('dimmed', !related.has(id));
  });

  edgeEls.forEach((el, i) => {
    const e = edges[i];
    if (!e) return;
    const isRelated = related.has(e.from) && related.has(e.to);
    el.classList.toggle('dimmed', !isRelated);
    el.classList.toggle('highlighted', isRelated);
    // Re-color
    if (isRelated) {
      el.setAttribute('stroke', COLORS.edgeHi);
      el.setAttribute('marker-end', 'url(#arrow)');
    } else {
      el.setAttribute('stroke', COLORS.edge);
    }
  });
}

/* ── Tooltip ────────────────────────────── */

function showTooltip(e, node) {
  if (!tooltipEl) return;
  const d = node.data || {};
  tooltipEl.innerHTML = `
    <div><span class="tt-label">${node.label}</span></div>
    <div class="tt-dim">agent: ${d.agent || '—'}</div>
    <div class="tt-dim">priority: ${d.priority || '—'} · weight: ${d.match_weight || '—'}</div>
    <div class="tt-dim">keywords: ${(d.keywords || []).length} · match: ${d.max_matches_required || 1}+</div>
    ${d.persona_path ? `<div class="tt-dim">persona: ${d.persona_path.split('/').pop()}</div>` : ''}
  `;
  tooltipEl.classList.add('visible');
  positionTooltip(e);
}

function showLiveTooltip(e, routeData, domain) {
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

function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.remove('visible');
}

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
  const s = status;
  const statusDot = s === 'active' || s === 'green' ? '🟢'
    : s === 'busy' || s === 'yellow' ? '🟡'
    : s === 'error' || s === 'red' ? '🔴'
    : '⚫';
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
