/**
 * grainworks DAG Renderer
 * Renders orchestrator routing topology as an interactive SVG graph.
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
 */
export function renderDAG(container, routes) {
  container.innerHTML = '';

  if (!routes || Object.keys(routes).length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="big-icon">⚡</div>No routes loaded</div>';
    return;
  }

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
