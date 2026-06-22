/**
 * grainworks Workflow Builder
 * Drag-and-drop visual workflow editor.
 * Zero deps, vanilla JS, SVG-based canvas.
 */

let nodes = [];
let edges = [];
let nextId = 1;
let selectedNode = null;
let connectSource = null;
let dragData = null;

const NODE_TYPES = {
  trigger:  { label: 'Trigger',  color: '#00cc66', icon: '⚡' },
  llm:      { label: 'LLM Call', color: '#6699ff', icon: '◆' },
  tool:     { label: 'Tool',     color: '#ccaa00', icon: '⚙' },
  condition:{ label: 'Condition',color: '#cc66ff', icon: '◇' },
  output:   { label: 'Output',   color: '#cc3333', icon: '●' },
};

const SAMPLE_WORKFLOW = {
  nodes: [
    { id: 'n1', type: 'trigger', label: 'Email Received', x: 300, y: 60 },
    { id: 'n2', type: 'llm', label: 'Classify Intent', x: 300, y: 200 },
    { id: 'n3', type: 'condition', label: 'Is Route Known?', x: 300, y: 340 },
    { id: 'n4', type: 'tool', label: 'Execute Route', x: 180, y: 480 },
    { id: 'n5', type: 'llm', label: 'Draft Response', x: 420, y: 480 },
    { id: 'n6', type: 'output', label: 'Reply Sent', x: 300, y: 620 },
  ],
  edges: [
    { from: 'n1', to: 'n2' },
    { from: 'n2', to: 'n3' },
    { from: 'n3', to: 'n4', label: 'yes' },
    { from: 'n3', to: 'n5', label: 'no' },
    { from: 'n4', to: 'n6' },
    { from: 'n5', to: 'n6' },
  ]
};

export function renderBuilder(container) {
  container.innerHTML = '';
  nodes = [];
  edges = [];
  nextId = 1;
  selectedNode = null;
  connectSource = null;

  const layout = document.createElement('div');
  layout.style.cssText = 'display:flex;height:100%;gap:0;';

  // ── Palette ──
  const palette = document.createElement('div');
  palette.style.cssText = `width:140px;flex-shrink:0;background:var(--bg-alt);border-right:1px solid var(--border);padding:12px;overflow-y:auto;`;

  const pTitle = document.createElement('div');
  pTitle.style.cssText = 'font-size:10px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;';
  pTitle.textContent = 'Nodes';
  palette.appendChild(pTitle);

  Object.entries(NODE_TYPES).forEach(([type, cfg]) => {
    const item = document.createElement('div');
    item.draggable = true;
    item.dataset.nodeType = type;
    item.style.cssText = `display:flex;align-items:center;gap:6px;padding:8px 10px;margin-bottom:4px;border:1px solid var(--border);border-radius:4px;cursor:grab;font-size:11px;color:var(--fg);background:var(--bg-panel);transition:all 0.15s;`;
    item.innerHTML = `<span style="font-size:12px;">${cfg.icon}</span> ${cfg.label}`;
    item.addEventListener('mouseenter', () => { item.style.borderColor = cfg.color; item.style.background = 'rgba(0,0,0,0.2)'; });
    item.addEventListener('mouseleave', () => { item.style.borderColor = 'var(--border)'; item.style.background = 'var(--bg-panel)'; });

    item.addEventListener('dragstart', (e) => {
      dragData = { type };
      e.dataTransfer.effectAllowed = 'copy';
      item.style.opacity = '0.5';
    });
    item.addEventListener('dragend', () => { item.style.opacity = '1'; dragData = null; });

    palette.appendChild(item);
  });

  // Palette footer with Load Sample button
  const loadBtn = document.createElement('button');
  loadBtn.textContent = '↺ Load Sample';
  loadBtn.style.cssText = `width:100%;margin-top:16px;padding:8px;font-size:10px;font-family:var(--font-mono);background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--accent);cursor:pointer;`;
  loadBtn.addEventListener('click', () => loadSample(container));
  palette.appendChild(loadBtn);

  // Export button
  const exportBtn = document.createElement('button');
  exportBtn.textContent = '⇧ Export YAML';
  exportBtn.style.cssText = `width:100%;margin-top:6px;padding:8px;font-size:10px;font-family:var(--font-mono);background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--fg-dim);cursor:pointer;`;
  exportBtn.addEventListener('click', () => exportYaml());
  palette.appendChild(exportBtn);

  layout.appendChild(palette);

  // ── Canvas ──
  const canvasWrap = document.createElement('div');
  canvasWrap.style.cssText = 'flex:1;position:relative;overflow:hidden;';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'builder-canvas';
  svg.style.cssText = 'width:100%;height:100%;display:block;';
  svg.setAttribute('viewBox', '0 0 900 700');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Defs for arrows
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'b-arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('orient', 'auto');
  const ap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  ap.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  ap.setAttribute('fill', '#555');
  marker.appendChild(ap);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // Edges group (behind nodes)
  const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  edgesGroup.id = 'builder-edges';
  svg.appendChild(edgesGroup);

  // Nodes group
  const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodesGroup.id = 'builder-nodes';
  svg.appendChild(nodesGroup);

  // Drop handling
  let isDragging = false;
  let dragStartX, dragStartY, dragNodeId;

  svg.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  svg.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dragData) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = 900 / rect.width;
    const scaleY = 700 / rect.height;
    const x = (e.clientX - rect.left) * scaleX - 60;
    const y = (e.clientY - rect.top) * scaleY - 20;
    addNode(dragData.type, x, y);
    dragData = null;
  });

  // Canvas click to deselect
  svg.addEventListener('click', (e) => {
    if (e.target === svg || e.target === nodesGroup || e.target === edgesGroup) {
      selectedNode = null;
      connectSource = null;
      updateSelection();
      document.getElementById('builder-inspector').innerHTML =
        '<div style="color:var(--fg-dim);font-size:11px;padding:12px;text-align:center;">Select a node to inspect</div>';
    }
  });

  canvasWrap.appendChild(svg);

  // ── Inspector Panel ──
  const inspector = document.createElement('div');
  inspector.id = 'builder-inspector';
  inspector.style.cssText = `width:200px;flex-shrink:0;background:var(--bg-alt);border-left:1px solid var(--border);padding:12px;overflow-y:auto;font-size:11px;`;
  inspector.innerHTML = '<div style="color:var(--fg-dim);font-size:11px;padding:12px;text-align:center;">Select a node to inspect</div>';
  layout.appendChild(inspector);

  // Canvas instructions
  const instructions = document.createElement('div');
  instructions.style.cssText = 'position:absolute;bottom:12px;left:160px;font-size:9px;color:var(--fg-dim);pointer-events:none;';
  instructions.textContent = 'drag nodes from palette · click source node then target to connect · click canvas to deselect';
  canvasWrap.appendChild(instructions);

  layout.appendChild(canvasWrap);
  container.appendChild(layout);

  // Load sample data
  loadSampleData(container);
}

function loadSampleData(container) {
  SAMPLE_WORKFLOW.nodes.forEach(n => {
    const cfg = NODE_TYPES[n.type] || NODE_TYPES.tool;
    addNode(n.type, n.x, n.y, n.id, n.label);
  });
  SAMPLE_WORKFLOW.edges.forEach(e => {
    edges.push({ from: e.from, to: e.to, label: e.label || '' });
  });
  renderAll();
}

function loadSample(container) {
  nodes = [];
  edges = [];
  nextId = 1;
  selectedNode = null;
  connectSource = null;
  loadSampleData(container);
}

function addNode(type, x, y, existingId, existingLabel) {
  const id = existingId || `n${nextId++}`;
  if (!existingId) nextId = Math.max(nextId, parseInt(id.slice(1)) + 1);
  const cfg = NODE_TYPES[type] || NODE_TYPES.tool;
  const node = {
    id,
    type,
    label: existingLabel || cfg.label,
    x: Math.max(0, Math.min(x, 850)),
    y: Math.max(0, Math.min(y, 650)),
    w: 120,
    h: 36,
    color: cfg.color,
    icon: cfg.icon,
  };
  nodes.push(node);
  renderAll();
  return node;
}

function renderAll() {
  renderEdges();
  renderNodes();
}

function renderEdges() {
  const g = document.getElementById('builder-edges');
  g.innerHTML = '';
  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);

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
    path.setAttribute('d', `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#555');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('marker-end', 'url(#b-arrow)');
    g.appendChild(path);

    if (e.label) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', cx);
      text.setAttribute('y', (y1 + y2) / 2 - 6);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', 'var(--fg-dim)');
      text.setAttribute('font-size', '9');
      text.textContent = e.label;
      g.appendChild(text);
    }
  });
}

function renderNodes() {
  const g = document.getElementById('builder-nodes');
  g.innerHTML = '';

  nodes.forEach(n => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    el.dataset.nodeId = n.id;
    el.style.cursor = 'pointer';

    const isSelected = selectedNode === n.id;
    const isConnect = connectSource === n.id;

    // Shadow
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    shadow.setAttribute('x', n.x + 2);
    shadow.setAttribute('y', n.y + 2);
    shadow.setAttribute('width', n.w);
    shadow.setAttribute('height', n.h);
    shadow.setAttribute('rx', '6');
    shadow.setAttribute('fill', 'rgba(0,0,0,0.3)');
    el.appendChild(shadow);

    // Body
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', n.x);
    rect.setAttribute('y', n.y);
    rect.setAttribute('width', n.w);
    rect.setAttribute('height', n.h);
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', 'var(--bg-panel)');
    rect.setAttribute('stroke', isConnect ? 'var(--accent)' : (isSelected ? n.color : 'var(--border)'));
    rect.setAttribute('stroke-width', isSelected || isConnect ? '2' : '1');
    el.appendChild(rect);

    // Color bar on left
    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('x', n.x);
    bar.setAttribute('y', n.y);
    bar.setAttribute('width', '4');
    bar.setAttribute('height', n.h);
    bar.setAttribute('rx', '6');
    bar.setAttribute('fill', n.color);
    el.appendChild(bar);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', n.x + n.w / 2 + 4);
    label.setAttribute('y', n.y + n.h / 2);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.setAttribute('fill', 'var(--fg)');
    label.setAttribute('font-size', '10');
    label.textContent = `${n.icon} ${n.label}`;
    el.appendChild(label);

    // ── Events ──
    let dragStart = null;

    el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const svgEl = document.getElementById('builder-canvas');
      const rect = svgEl.getBoundingClientRect();
      const scaleX = 900 / rect.width;
      const scaleY = 700 / rect.height;
      dragStart = { x: (e.clientX - rect.left) * scaleX - n.x, y: (e.clientY - rect.top) * scaleY - n.y };
      dragNodeId = n.id;

      const onMove = (ev) => {
        if (!dragStart) return;
        const r = svgEl.getBoundingClientRect();
        const sx = 900 / r.width;
        const sy = 700 / r.height;
        n.x = Math.max(0, Math.min((ev.clientX - r.left) * sx - dragStart.x, 850));
        n.y = Math.max(0, Math.min((ev.clientY - r.top) * sy - dragStart.y, 650));
        renderAll();
      };
      const onUp = () => {
        dragStart = null;
        dragNodeId = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Click for selection + connection mode
    el.addEventListener('click', (e) => {
      e.stopPropagation();

      // If there's a connect source and it's not this node, make connection
      if (connectSource && connectSource !== n.id) {
        // Check if connection already exists
        const exists = edges.some(ee => ee.from === connectSource && ee.to === n.id);
        if (!exists) {
          edges.push({ from: connectSource, to: n.id, label: '' });
          renderAll();
        }
        connectSource = null;
        renderAll();
        updateInspector(n.id);
        return;
      }

      // Toggle selection
      if (selectedNode === n.id && !e.ctrlKey) {
        // Second click on same node enters connect mode
        connectSource = n.id;
        renderAll();
        document.getElementById('builder-inspector').innerHTML =
          `<div style="color:var(--accent);font-size:11px;padding:12px;">Click another node to connect from <strong>${n.label}</strong></div>`;
        return;
      }

      selectedNode = n.id;
      connectSource = null;
      updateSelection();
      updateInspector(n.id);
    });

    g.appendChild(el);
  });
}

function updateSelection() {
  const g = document.getElementById('builder-nodes');
  // Visual state is handled in renderNodes
  renderAll();
}

function updateInspector(nodeId) {
  const panel = document.getElementById('builder-inspector');
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;

  const cfg = NODE_TYPES[node.type] || {};
  const inEdges = edges.filter(e => e.to === nodeId).length;
  const outEdges = edges.filter(e => e.from === nodeId).length;

  panel.innerHTML = `
    <div style="color:${node.color};font-size:13px;font-weight:600;margin-bottom:8px;">${node.icon} ${node.label}</div>
    <div style="margin-bottom:12px;">
      <div style="color:var(--fg-dim);font-size:10px;margin-bottom:2px;">id: ${node.id}</div>
      <div style="color:var(--fg-dim);font-size:10px;margin-bottom:2px;">type: ${node.type}</div>
      <div style="color:var(--fg-dim);font-size:10px;margin-bottom:2px;">pos: ${Math.round(node.x)}, ${Math.round(node.y)}</div>
      <div style="color:var(--fg-dim);font-size:10px;">connections: ${inEdges} in · ${outEdges} out</div>
    </div>
    <hr style="border:none;border-top:1px solid var(--border);margin:8px 0;">
    <div style="font-size:10px;color:var(--fg);margin-bottom:6px;font-weight:600;">configuration</div>
    <div style="margin-bottom:6px;">
      <div style="font-size:9px;color:var(--fg-dim);margin-bottom:2px;">label</div>
      <input type="text" id="inspector-label" value="${node.label}" style="width:100%;padding:4px 6px;font-size:10px;font-family:var(--font-mono);background:var(--bg);border:1px solid var(--border);border-radius:3px;color:var(--fg);">
    </div>
    <div style="margin-bottom:6px;">
      <div style="font-size:9px;color:var(--fg-dim);margin-bottom:2px;">delete node</div>
      <button id="inspector-delete" style="width:100%;padding:4px;font-size:10px;font-family:var(--font-mono);background:transparent;border:1px solid var(--danger);border-radius:3px;color:var(--danger);cursor:pointer;">✕ Delete</button>
    </div>
  `;

  document.getElementById('inspector-label')?.addEventListener('change', (e) => {
    node.label = e.target.value;
    renderAll();
    updateInspector(nodeId);
  });

  document.getElementById('inspector-delete')?.addEventListener('click', () => {
    nodes = nodes.filter(n => n.id !== nodeId);
    edges = edges.filter(e => e.from !== nodeId && e.to !== nodeId);
    selectedNode = null;
    renderAll();
    panel.innerHTML = '<div style="color:var(--fg-dim);font-size:11px;padding:12px;text-align:center;">Node deleted</div>';
  });
}

function exportYaml() {
  const lines = ['# Workflow exported from grainworks workbench', 'workflow:', '  nodes:'];
  nodes.forEach(n => {
    lines.push(`    - id: ${n.id}`);
    lines.push(`      type: ${n.type}`);
    lines.push(`      label: "${n.label}"`);
    lines.push(`      x: ${Math.round(n.x)}`);
    lines.push(`      y: ${Math.round(n.y)}`);
  });
  lines.push('  edges:');
  edges.forEach(e => {
    lines.push(`    - from: ${e.from}`);
    lines.push(`      to: ${e.to}`);
    if (e.label) lines.push(`      label: "${e.label}"`);
  });

  const yaml = lines.join('\n');

  // Show in a modal
  const existing = document.getElementById('export-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'export-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:200;';

  const modal = document.createElement('div');
  modal.style.cssText = `background:var(--bg-panel);border:1px solid var(--border);border-radius:8px;padding:20px;width:600px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;`;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
  header.innerHTML = `<span style="color:var(--accent);font-size:12px;font-weight:600;">Exported Workflow YAML</span>
    <button id="export-close" style="background:none;border:none;color:var(--fg-dim);cursor:pointer;font-size:16px;">✕</button>`;
  modal.appendChild(header);

  const textarea = document.createElement('textarea');
  textarea.readOnly = true;
  textarea.value = yaml;
  textarea.style.cssText = `flex:1;min-height:200px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:12px;font-family:var(--font-mono);font-size:10px;color:var(--fg);resize:none;`;
  modal.appendChild(textarea);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;justify-content:flex-end;';

  const copyBtn = document.createElement('button');
  copyBtn.textContent = '📋 Copy';
  copyBtn.style.cssText = `padding:6px 14px;font-size:10px;font-family:var(--font-mono);background:transparent;border:1px solid var(--accent);border-radius:4px;color:var(--accent);cursor:pointer;`;
  copyBtn.addEventListener('click', () => {
    textarea.select();
    document.execCommand('copy');
    copyBtn.textContent = '✓ Copied';
  });
  btnRow.appendChild(copyBtn);

  modal.appendChild(btnRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.getElementById('export-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
