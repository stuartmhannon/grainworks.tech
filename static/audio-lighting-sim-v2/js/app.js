/**
 * app.js — Audio Lighting Sim v2 entry point
 *
 * Wires all modules to Three.js scene, DOM events, and UI panels.
 *
 * Interaction mode machine:
 *   idle → draw-zone | place-entity | calibrate
 *   idle → select-zone | select-entity (via click)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  getProject, loadProject, resetProject,
  setFloorPlan, saveProject, loadProjectFromStorage,
  listSavedProjects, deleteProjectFromStorage,
  exportProjectJSON, importProjectJSON,
  feetToPixels, pixelsToFeet,
} from './state.js';
import * as cal from './calibration.js';
import * as zones from './zones.js';
import * as entity from './entity.js';
import * as palette from './palette.js';
import * as heatmap from './heatmap.js';
import { generateBOM, renderBOMHTML, exportBOMCSV } from './bom.js';
import { downloadGLTF } from './export-3d.js';

// ========================================================================
// DOM refs
// ========================================================================
const container = document.getElementById('three-container');
const paletteEl = document.getElementById('palette');
const zonePanel = document.getElementById('zone-panel');
const entityPanel = document.getElementById('entity-panel');
const bomPanel = document.getElementById('bom-panel');
const statusBar = document.getElementById('status-bar');
const heatmapCanvas = document.getElementById('heatmap-canvas');

// ========================================================================
// Scene setup
// ========================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// Orthographic camera for top-down (default)
const containerW = container.clientWidth;
const containerH = container.clientHeight;
const aspect = containerW / containerH;
const viewSize = 10;

const camera = new THREE.OrthographicCamera(
  -viewSize * aspect, viewSize * aspect,
  viewSize, -viewSize,
  0.1, 100
);
camera.position.set(0, 10, 0);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(containerW, containerH);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.target.set(0, 0, 0);
controls.update();

// ========================================================================
// Lights
// ========================================================================
scene.add(new THREE.AmbientLight(0x444444));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// ========================================================================
// Ground plane (for raycasting)
// ========================================================================
const groundGeo = new THREE.PlaneGeometry(20, 20);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a1a, side: THREE.DoubleSide, transparent: true, opacity: 0,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.name = 'ground';
scene.add(ground);

// Grid helper
const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x222222);
gridHelper.position.y = -0.01;
scene.add(gridHelper);

// ========================================================================
// Floor plan mesh
// ========================================================================
let floorPlanMesh = null;

// ========================================================================
// Zone visuals group
// ========================================================================
const zoneGroup = new THREE.Group();
scene.add(zoneGroup);

// ========================================================================
// Entity visuals group
// ========================================================================
const entityGroup = new THREE.Group();
scene.add(entityGroup);

// ========================================================================
// Calibration temp graphics
// ========================================================================
const calGroup = new THREE.Group();
scene.add(calGroup);

// ========================================================================
// Raycaster
// ========================================================================
const raycaster = new THREE.Raycaster();

// ========================================================================
// Helpers
// ========================================================================
function screenToWorld(clientX, clientY) {
  const rect = container.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const intersects = raycaster.intersectObject(ground);
  if (intersects.length > 0) {
    return { x: intersects[0].point.x, y: intersects[0].point.z };
  }
  return null;
}

function rebuildZoneVisuals() {
  // Clear old visuals
  while (zoneGroup.children.length) {
    const c = zoneGroup.children[0];
    disposeObject(c);
    zoneGroup.remove(c);
  }

  const proj = getProject();
  for (const zone of proj.zones) {
    if (!zone.boundary || zone.boundary.length < 3) continue;

    const shape = new THREE.Shape();
    shape.moveTo(zone.boundary[0].x, zone.boundary[0].y);
    for (let i = 1; i < zone.boundary.length; i++) {
      shape.lineTo(zone.boundary[i].x, zone.boundary[i].y);
    }
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x446688,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;
    mesh.userData.zoneId = zone.id;
    mesh.userData.isZone = true;
    mesh.name = `zone-${zone.name}`;
    zoneGroup.add(mesh);

    // Zone outline
    const outlineGeo = new THREE.EdgesGeometry(geo);
    const outlineMat = new THREE.LineBasicMaterial({
      color: 0x6699cc,
      transparent: true,
      opacity: 0.6,
    });
    const outline = new THREE.LineSegments(outlineGeo, outlineMat);
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    zoneGroup.add(outline);
  }
}

function rebuildEntityVisuals() {
  while (entityGroup.children.length) {
    const c = entityGroup.children[0];
    disposeObject(c);
    entityGroup.remove(c);
  }

  const proj = getProject();
  for (const zone of proj.zones) {
    for (const ent of zone.entities) {
      const color = ent.type === 'fixture' ? 0xffcc44 : 0x44aaff;
      const radius = ent.type === 'fixture' ? 0.3 : 0.4;

      const cGeo = new THREE.CircleGeometry(radius, 16);
      const cMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(cGeo, cMat);
      mesh.position.set(ent.position.x, 0.02, ent.position.y);
      mesh.rotation.x = -Math.PI / 2;
      mesh.userData.zoneId = zone.id;
      mesh.userData.entityId = ent.id;
      mesh.userData.isEntity = true;
      mesh.name = `entity-${ent.id}`;

      // Rotation indicator (standalone line, not child of rotated mesh)
      if (ent.rotation) {
        const rad = ent.rotation * Math.PI / 180;
        const len = radius * 1.5;
        const endX = ent.position.x + Math.cos(rad) * len;
        const endZ = ent.position.y + Math.sin(rad) * len;
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ent.position.x, 0.03, ent.position.y),
          new THREE.Vector3(endX, 0.03, endZ),
        ]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
        const line = new THREE.Line(lineGeo, lineMat);
        entityGroup.add(line);
      }

      entityGroup.add(mesh);
    }
  }
}

function disposeObject(obj) {
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
    else obj.material.dispose();
  }
  if (obj.children) {
    while (obj.children.length) {
      disposeObject(obj.children[0]);
      obj.remove(obj.children[0]);
    }
  }
}

// ========================================================================
// Click handler — routes to the active mode
// ========================================================================
function onCanvasClick(event) {
  const world = screenToWorld(event.clientX, event.clientY);
  if (!world) return;

  // Calibration mode
  if (cal.getMode() === 'calibrating') {
    const proj = getProject();
    const fp = proj.floorPlan;
    const worldH = groundGeo.parameters.height / 2 * 2; // ground plane is 20x20, so half-height = 10
    const floorPlanPixels = fp ? { naturalW: fp.naturalW, naturalH: fp.naturalH, worldH } : null;
    const result = cal.handleClick(world.x, world.y, floorPlanPixels);
    if (result && result.type === 'complete') {
      // Show length prompt
      const lengthFeet = parseFloat(prompt(
        `How long is this wall? (pixel distance: ${result.pixelDist.toFixed(1)}px)`,
        '10'
      ));
      if (lengthFeet && lengthFeet > 0) {
        cal.confirmCalibration(result.p1, result.p2, lengthFeet);
        rebuildScaleBar();
        setStatus(`Scale set: ${lengthFeet}'`);
      } else {
        cal.cancelCalibration();
        setStatus('Calibration cancelled');
      }
    }
    return;
  }

  // Zone drawing mode
  if (zones.getMode() === 'drawing') {
    const result = zones.handleClick(world.x, world.y);
    updateZoneDrawingPreview();
    if (result && result.type === 'zone-created') {
      const name = prompt('Zone name:', 'Room');
      const height = parseFloat(prompt('Room height (feet):', '8'));
      if (name && height > 0) {
        zones.confirmZone(result.boundary, name, height);
        rebuildZoneVisuals();
        setStatus(`Zone "${name}" created`);
      } else {
        zones.cancelDrawing();
        setStatus('Zone creation cancelled');
      }
    }
    return;
  }

  // Entity placement mode
  if (entity.isPlacing()) {
    const proj = getProject();
    const result = entity.handleClick(world.x, world.y, proj.zones);
    if (!result) {
      setStatus('Click inside a zone to place the entity');
      return;
    }

    // AFF/AAS dialog
    const affStr = prompt(`Mount height AFF (feet) for ${entity.getPendingModelKey()}:`, '8');
    const aff = parseFloat(affStr);
    if (isNaN(aff)) {
      setStatus('Placement cancelled: AFF required');
      return;
    }

    const useAas = confirm('Use AAS (Above Adjacent Surface) instead of AFF?');
    let aas = null;
    if (useAas) {
      const aboveSurface = parseFloat(prompt('Height above surface (feet):', '2'));
      const surfaceHeight = parseFloat(prompt('Surface height (feet e.g. counter=2.5):', '2.5'));
      if (!isNaN(aboveSurface) && !isNaN(surfaceHeight)) {
        aas = { affSurface: aboveSurface, surfaceHeight };
      }
    }

    entity.confirmEntity(result.zoneId, result.x, result.y, aff, aas, 0);
    rebuildEntityVisuals();
    heatmap.requestRecalc();
    setStatus(`Entity placed in "${result.zoneName}" at AFF ${aff}'`);
    return;
  }

  // Idle — hit-test entities first, then zones
  const entHit = hitTestEntity(world.x, world.y);
  if (entHit) {
    entity.selectEntity(entHit.zoneId, entHit.entityId);
    showEntityPanel(entHit.zoneId, entHit.entityId);
    heatmap.requestRecalc();
    return;
  }

  const zoneHit = hitTestZone(world.x, world.y);
  if (zoneHit) {
    zones.selectZone(zoneHit);
    showZonePanel(zoneHit);
    heatmap.requestRecalc();
    return;
  }

  // Deselect
  entity.deselectEntity();
  zones.deselectZone();
  hidePanels();
}

function hitTestEntity(worldX, worldY) {
  const proj = getProject();
  for (const zone of proj.zones) {
    for (const ent of zone.entities) {
      const dx = worldX - ent.position.x;
      const dy = worldY - ent.position.y;
      if (dx * dx + dy * dy < 0.5) {  // within ~0.7 ft radius
        return { zoneId: zone.id, entityId: ent.id };
      }
    }
  }
  return null;
}

function hitTestZone(worldX, worldY) {
  const proj = getProject();
  for (let i = proj.zones.length - 1; i >= 0; i--) {
    if (zones.pointInZone(proj.zones[i].id, worldX, worldY)) {
      return proj.zones[i].id;
    }
  }
  return null;
}

// ========================================================================
// Zone drawing preview
// ========================================================================
let drawPreviewGroup = new THREE.Group();
scene.add(drawPreviewGroup);

function updateZoneDrawingPreview() {
  while (drawPreviewGroup.children.length) {
    const c = drawPreviewGroup.children[0];
    disposeObject(c);
    drawPreviewGroup.remove(c);
  }

  const verts = zones.getCurrentVertices();
  if (verts.length === 0) return;

  // Dots for vertices
  for (const v of verts) {
    const dotGeo = new THREE.CircleGeometry(0.15, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x88ff88, depthTest: false });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(v.x, 0.015, v.y);
    drawPreviewGroup.add(dot);
  }

  // Lines between vertices
  if (verts.length >= 2) {
    const pts = verts.map(v => new THREE.Vector3(v.x, 0.015, v.y));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x88ff88, transparent: true, opacity: 0.6 });
    drawPreviewGroup.add(new THREE.Line(lineGeo, lineMat));
  }
}

// ========================================================================
// Scale bar
// ========================================================================
let scaleBarGroup = new THREE.Group();
scene.add(scaleBarGroup);

function rebuildScaleBar() {
  while (scaleBarGroup.children.length) {
    const c = scaleBarGroup.children[0];
    disposeObject(c);
    scaleBarGroup.remove(c);
  }

  const bar = cal.getScaleBar(10);
  if (!bar) return;

  const x = -8, y = -8;  // bottom-left corner
  const pts = [
    new THREE.Vector3(x, 0.02, y),
    new THREE.Vector3(x + bar.lengthPixels / getProject().calibration.pixelsPerFoot, 0.02, y),
  ];
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x88ff88 });
  const line = new THREE.Line(lineGeo, lineMat);
  scaleBarGroup.add(line);

  // Tick marks
  for (const tick of [0, 1]) {
    const tickX = pts[tick].x;
    const tickPts = [
      new THREE.Vector3(tickX, 0.02, y - 0.3),
      new THREE.Vector3(tickX, 0.02, y + 0.3),
    ];
    const tGeo = new THREE.BufferGeometry().setFromPoints(tickPts);
    const tMat = new THREE.LineBasicMaterial({ color: 0x88ff88 });
    scaleBarGroup.add(new THREE.Line(tGeo, tMat));
  }
}

// ========================================================================
// Panels
// ========================================================================
function showZonePanel(zoneId) {
  const proj = getProject();
  const zone = proj.zones.find(z => z.id === zoneId);
  if (!zone) return;

  zonePanel.style.display = 'block';
  const bom = generateBOM();
  const zBom = bom.zones.find(z => z.zoneId === zoneId);
  zonePanel.innerHTML = `
    <h3>${zone.name}</h3>
    <label>Name: <input type="text" id="zone-name-input" value="${zone.name}"></label>
    <label>Room height: <input type="number" id="zone-height-input" value="${zone.roomHeight}" min="4" max="40" step="0.5"> ft</label>
    <p>Area: ${(zBom?.area || 0).toFixed(1)} ft²</p>
    <p>Fixtures: ${zBom?.fixtureCount || 0} · Speakers: ${zBom?.speakerCount || 0}</p>
    <button class="btn btn-danger" id="btn-delete-zone">Delete Zone</button>
  `;

  document.getElementById('zone-name-input')?.addEventListener('change', (e) => {
    zones.updateZone(zoneId, { name: e.target.value });
  });
  document.getElementById('zone-height-input')?.addEventListener('change', (e) => {
    zones.updateZone(zoneId, { roomHeight: parseFloat(e.target.value) });
  });
  document.getElementById('btn-delete-zone')?.addEventListener('click', () => {
    zones.deleteSelectedZone();
    rebuildZoneVisuals();
    rebuildEntityVisuals();
    hidePanels();
    heatmap.requestRecalc();
    setStatus('Zone deleted');
  });
}

function showEntityPanel(zoneId, entityId) {
  const proj = getProject();
  const zone = proj.zones.find(z => z.id === zoneId);
  if (!zone) return;
  const ent = zone.entities.find(e => e.id === entityId);
  if (!ent) return;

  entityPanel.style.display = 'block';
  const modelName = (proj.modelLibrary[ent.modelKey]?.name) || ent.modelKey;
  const mountDesc = ent.aas
    ? `AAS: ${ent.aas.affSurface}' above ${ent.aas.surfaceHeight}' surface`
    : `AFF: ${ent.aff}'`;

  entityPanel.innerHTML = `
    <h3>${modelName}</h3>
    <p>Type: ${ent.type} · ${mountDesc}</p>
    <p>Position: ${ent.position.x.toFixed(2)}, ${ent.position.y.toFixed(2)}</p>
    <label>AFF: <input type="number" id="entity-aff-input" value="${ent.aff}" min="0" max="40" step="0.5"> ft</label>
    ${ent.aas ? `<p>AAS: ${ent.aas.affSurface}' above ${ent.aas.surfaceHeight}' surface</p>` : ''}
    <label>Rotation: <input type="range" id="entity-rotation-input" min="0" max="360" value="${ent.rotation || 0}" step="5"> <span id="rotation-value">${ent.rotation || 0}°</span></label>
    <button class="btn btn-danger" id="btn-delete-entity">Delete</button>
  `;

  document.getElementById('entity-aff-input')?.addEventListener('change', (e) => {
    entity.updateEntity(zoneId, entityId, { aff: parseFloat(e.target.value) });
    rebuildEntityVisuals();
    heatmap.requestRecalc();
  });
  document.getElementById('entity-rotation-input')?.addEventListener('input', (e) => {
    const rot = parseFloat(e.target.value);
    entity.updateEntity(zoneId, entityId, { rotation: rot });
    document.getElementById('rotation-value').textContent = `${rot}°`;
    rebuildEntityVisuals();
    heatmap.requestRecalc();
  });
  document.getElementById('btn-delete-entity')?.addEventListener('click', () => {
    entity.deleteSelectedEntity();
    rebuildEntityVisuals();
    hidePanels();
    heatmap.requestRecalc();
    setStatus('Entity deleted');
  });
}

function hidePanels() {
  zonePanel.style.display = 'none';
  entityPanel.style.display = 'none';
  bomPanel.style.display = 'none';
}

// ========================================================================
// Status bar
// ========================================================================
function setStatus(msg) {
  statusBar.textContent = msg;
}

// ========================================================================
// DOM event wiring
// ========================================================================

// Canvas click
container.addEventListener('click', onCanvasClick);

// Double-click for zone completion
container.addEventListener('dblclick', (event) => {
  if (zones.getMode() === 'drawing') {
    const world = screenToWorld(event.clientX, event.clientY);
    if (world) {
      const result = zones.handleDoubleClick(world.x, world.y);
      if (result && result.type === 'zone-created') {
        const name = prompt('Zone name:', 'Room');
        const height = parseFloat(prompt('Room height (feet):', '8'));
        if (name && height > 0) {
          zones.confirmZone(result.boundary, name, height);
          rebuildZoneVisuals();
          setStatus(`Zone "${name}" created`);
        } else {
          zones.cancelDrawing();
          setStatus('Zone creation cancelled');
        }
      }
    }
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    entity.cancelPlacing();
    zones.cancelDrawing();
    cal.cancelCalibration();
    setStatus('');
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    if (entity.getSelectedEntityId()) {
      entity.deleteSelectedEntity();
      rebuildEntityVisuals();
      heatmap.requestRecalc();
      hidePanels();
      setStatus('Entity deleted');
    } else if (zones.getSelectedZoneId()) {
      zones.deleteSelectedZone();
      rebuildZoneVisuals();
      rebuildEntityVisuals();
      heatmap.requestRecalc();
      hidePanels();
      setStatus('Zone deleted');
    }
  }
  // Layer shortcuts
  if (e.key === '1') { document.getElementById('btn-lux-mode')?.click(); }
  if (e.key === '2') { document.getElementById('btn-spl-mode')?.click(); }
  if (e.key === '3') { document.getElementById('btn-both-mode')?.click(); }
});

// ========================================================================
// Palette rendering
// ========================================================================
palette.loadBuiltins();

function renderPalette() {
  paletteEl.innerHTML = '';
  const models = palette.getAllModels();

  const fixtureModels = models.filter(m => m.type === 'fixture');
  const speakerModels = models.filter(m => m.type === 'speaker');

  if (fixtureModels.length) {
    const title = document.createElement('h3');
    title.textContent = 'Fixtures';
    paletteEl.appendChild(title);
    for (const m of fixtureModels) {
      paletteEl.appendChild(createPaletteCard(m));
    }
  }

  if (speakerModels.length) {
    const title = document.createElement('h3');
    title.textContent = 'Speakers';
    paletteEl.appendChild(title);
    for (const m of speakerModels) {
      paletteEl.appendChild(createPaletteCard(m));
    }
  }
}

function createPaletteCard(model) {
  const card = document.createElement('div');
  card.className = 'palette-card';
  card.dataset.key = model.key;
  card.style.borderLeftColor = model.color;

  const colorDot = document.createElement('span');
  colorDot.className = 'palette-dot';
  colorDot.style.backgroundColor = model.color;
  card.appendChild(colorDot);

  const info = document.createElement('div');
  info.className = 'palette-info';

  const name = document.createElement('div');
  name.className = 'palette-name';
  name.textContent = model.name;
  info.appendChild(name);

  const desc = document.createElement('div');
  desc.className = 'palette-desc';
  if (model.type === 'fixture') {
    desc.textContent = `${model.params.beamAngle}° beam · ${model.params.wattage}W`;
  } else {
    desc.textContent = `${model.params.sensitivity}dB sens · ${model.params.power}W`;
  }
  info.appendChild(desc);
  card.appendChild(info);

  card.addEventListener('click', () => {
    // Deselect other cards
    document.querySelectorAll('.palette-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    entity.startPlacing(model.type, model.key);
    setStatus(`Placing: ${model.name} — click inside a zone`);
  });

  return card;
}

// ========================================================================
// Toolbar wiring
// ========================================================================
function wireToolbar() {
  // Draw Zone
  document.getElementById('btn-draw-zone')?.addEventListener('click', () => {
    zones.startDrawing();
    setStatus('Click to draw zone boundary. Click first vertex or double-click to close.');
  });

  // Calibrate
  document.getElementById('btn-calibrate')?.addEventListener('click', () => {
    if (!cal.isCalibrated()) {
      cal.startCalibration();
      setStatus('Calibration: click two points on the floor plan');
    } else {
      if (confirm('Re-calibrate? Current scale will be overwritten.')) {
        cal.startCalibration();
        setStatus('Calibration: click two points on the floor plan');
      }
    }
  });

  // Upload floor plan
  document.getElementById('btn-upload-plan')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          setFloorPlan(ev.target.result, img.naturalWidth, img.naturalHeight);
          // Apply as texture
          const texture = new THREE.Texture(img);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          if (floorPlanMesh) {
            floorPlanMesh.material.map = texture;
            floorPlanMesh.material.needsUpdate = true;
          } else {
            const ratio = img.naturalWidth / img.naturalHeight;
            const h = 10;
            const w = h * ratio;
            const fGeo = new THREE.PlaneGeometry(w, h);
            const fMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
            floorPlanMesh = new THREE.Mesh(fGeo, fMat);
            floorPlanMesh.rotation.x = -Math.PI / 2;
            floorPlanMesh.position.y = 0;
            floorPlanMesh.name = 'floorplan';
            scene.add(floorPlanMesh);
          }
          setStatus(`Floor plan loaded: ${file.name}`);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });

  // Upload IES
  document.getElementById('btn-upload-ies')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ies';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const model = await palette.uploadIESFile(file);
        renderPalette();
        setStatus(`IES loaded: ${model.name}`);
      } catch (err) {
        setStatus(`IES error: ${err}`);
      }
    };
    input.click();
  });

  // Upload GLL
  document.getElementById('btn-upload-gll')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.gll';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const model = await palette.uploadGLLFile(file);
        renderPalette();
        setStatus(`GLL loaded: ${model.name}`);
      } catch (err) {
        setStatus(`GLL error: ${err}`);
      }
    };
    input.click();
  });

  // Layer buttons
  const toggleLayer = (mode) => {
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.layer-btn[data-mode="${mode}"]`)?.classList.add('active');
    heatmap.setMode(mode);
  };
  document.getElementById('btn-lux-mode')?.addEventListener('click', () => toggleLayer('lux'));
  document.getElementById('btn-spl-mode')?.addEventListener('click', () => toggleLayer('spl'));
  document.getElementById('btn-both-mode')?.addEventListener('click', () => toggleLayer('both'));

  // Heatmap resolution slider
  const resSlider = document.getElementById('hm-resolution');
  const resVal = document.getElementById('hm-resolution-value');
  if (resSlider) {
    resSlider.addEventListener('input', () => {
      const v = parseFloat(resSlider.value);
      resVal.textContent = v.toFixed(1);
      heatmap.setResolution(v);
    });
  }

  // Heatmap sensitivity slider
  const sensSlider = document.getElementById('hm-sensitivity');
  const sensVal = document.getElementById('hm-sensitivity-value');
  if (sensSlider) {
    sensSlider.addEventListener('input', () => {
      const v = parseFloat(sensSlider.value);
      sensVal.textContent = v.toFixed(1);
      heatmap.setSensitivity(v);
    });
  }

  // BOM
  document.getElementById('btn-bom')?.addEventListener('click', () => {
    bomPanel.style.display = 'block';
    bomPanel.innerHTML = renderBOMHTML();
    bomPanel.querySelector('.btn-download-csv')?.remove();
    // Add CSV download button
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-download-csv';
    btn.textContent = 'Download CSV';
    btn.addEventListener('click', () => {
      const csv = exportBOMCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bom.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
    bomPanel.appendChild(btn);
  });

  // 3D Export
  document.getElementById('btn-3d-export')?.addEventListener('click', async () => {
    setStatus('Generating 3D scene...');
    try {
      await downloadGLTF(THREE, 'audio-lighting-sim-3d.glb');
      setStatus('3D file downloaded');
    } catch (err) {
      setStatus(`3D export error: ${err.message}`);
    }
  });

  // New Project
  document.getElementById('btn-new-project')?.addEventListener('click', () => {
    resetProject();
    rebuildZoneVisuals();
    rebuildEntityVisuals();
    heatmap.requestRecalc();
    hidePanels();
    if (floorPlanMesh) {
      scene.remove(floorPlanMesh);
      floorPlanMesh = null;
    }
    // Clear scale bar
    while (scaleBarGroup.children.length) scaleBarGroup.remove(scaleBarGroup.children[0]);
    setStatus('New project');
  });

  // Save
  document.getElementById('btn-save')?.addEventListener('click', () => {
    const name = prompt('Save project as:', getProject().meta.name);
    if (name) {
      saveProject(name);
      setStatus(`Project saved: ${name}`);
    }
  });

  // Load
  document.getElementById('btn-load')?.addEventListener('click', () => {
    const list = listSavedProjects();
    if (list.length === 0) {
      setStatus('No saved projects');
      return;
    }
    const names = list.map(p => p.name);
    // Simple prompt for now
    const name = prompt('Load project:\n' + names.join('\n'), names[0]);
    if (name && names.includes(name)) {
      loadProjectFromStorage(name);
      // Restore floor plan texture from saved dataUrl
      const proj = getProject();
      if (proj.floorPlan && proj.floorPlan.dataUrl) {
        const img = new Image();
        img.onload = () => {
          const texture = new THREE.Texture(img);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          if (floorPlanMesh) {
            floorPlanMesh.material.map = texture;
            floorPlanMesh.material.needsUpdate = true;
          } else {
            const ratio = proj.floorPlan.naturalW / proj.floorPlan.naturalH;
            const h = 10;
            const w = h * ratio;
            const fGeo = new THREE.PlaneGeometry(w, h);
            const fMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
            floorPlanMesh = new THREE.Mesh(fGeo, fMat);
            floorPlanMesh.rotation.x = -Math.PI / 2;
            floorPlanMesh.position.y = 0;
            floorPlanMesh.name = 'floorplan';
            scene.add(floorPlanMesh);
          }
          rebuildZoneVisuals();
          rebuildEntityVisuals();
          rebuildScaleBar();
          heatmap.requestRecalc();
          renderPalette();
          setStatus(`Project loaded: ${name}`);
        };
        img.src = proj.floorPlan.dataUrl;
      } else {
        rebuildZoneVisuals();
        rebuildEntityVisuals();
        rebuildScaleBar();
        heatmap.requestRecalc();
        renderPalette();
        setStatus(`Project loaded: ${name}`);
      }
    }
  });
}

// ========================================================================
// Animation loop
// ========================================================================
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ========================================================================
// Init
// ========================================================================
function init() {
  cal.initStatusDisplay('status-bar');
  heatmap.init(document.getElementById('heatmap-canvas'));
  renderPalette();
  wireToolbar();
  animate();

  // Resize
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const a = w / h;
    camera.left = -viewSize * a;
    camera.right = viewSize * a;
    camera.top = viewSize;
    camera.bottom = -viewSize;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    heatmapCanvas.width = w;
    heatmapCanvas.height = h;
  });

  setStatus('Ready — upload a floor plan, calibrate scale, draw zones, place entities');
}

init();
