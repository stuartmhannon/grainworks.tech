/**
 * app.js — Audio-Lighting Simulator (Phase 3)
 *
 * Phase 3 additions:
 * - Real IES file upload and parsing (drag-drop .ies onto canvas)
 * - Drag-from-palette (HTML5 drag from fixture cards onto the Three.js scene)
 * - Smooth interpolated heatmap overlay (bilinear, putImageData)
 * - Fixture rotation for wall speakers (orientation indicator + slider)
 *
 * ponytail: IES upload creates fixtures from real photometric data;
 * parametric presets remain available for quick placement.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  sampleGrid,
  renderInterpolatedHeatmap,
  renderCompositeInterpolated,
} from '../simulation/coverage-renderer.js';
import { parseIES, calculateIlluminance } from '../simulation/lighting.js';
import { calculateSPL } from '../simulation/acoustic.js';
import { parseGLLJson, addImportedPresets, BUILTIN_PRESETS } from '../simulation/speaker-library.js';

// --- DOM refs ---
const container = document.getElementById('three-container');
const placeholder = document.getElementById('placeholder');
const canvasArea = document.getElementById('canvas-area');
const selectionInfo = document.getElementById('selection-info');
const statLux = document.getElementById('stat-lux');
const statSpl = document.getElementById('stat-spl');
const statFixtures = document.getElementById('stat-fixtures');
const statSpeakers = document.getElementById('stat-speakers');
const btnExportBom = document.getElementById('btn-export-bom');
const btnUpload = document.getElementById('btn-upload');
const btnIesUpload = document.getElementById('btn-ies-upload');
const btnLux = document.getElementById('btn-lux-mode');
const btnSpl = document.getElementById('btn-spl-mode');
const btnComposite = document.getElementById('btn-composite-mode');

// --- State ---
let activeMode = 'lux';             // 'lux' | 'spl' | 'overlay' | 'maximum'
let activePaletteType = null;       // { type: 'fixture'|'speaker', ...config }
let activeRotationAngle = 0;       // degrees, for wall speakers
const placedFixtures = [];
const placedSpeakers = [];
let floorPlanMesh = null;
let heatmapCanvas = null;
let heatmapCtx = null;
let selectedObject = null;
let isDragging = false;
let fileInputIES = null;
let raycaster = new THREE.Raycaster();

// Coverage recalculation throttle
let recalcTimeout = null;
const RECALC_DEBOUNCE_MS = 150;

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

// Room bounds (in world units, meters)
const room = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };

const aspect = container.clientWidth / container.clientHeight;
const viewSize = 10;
const camera = new THREE.OrthographicCamera(
  -viewSize * aspect, viewSize * aspect,
  viewSize, -viewSize,
  0.1, 100
);
camera.position.set(0, 10, 0);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.target.set(0, 0, 0);
controls.update();

// --- Grid Helper ---
const gridHelper = new THREE.GridHelper(10, 10, 0x333333, 0x222222);
gridHelper.position.y = -0.01;
scene.add(gridHelper);

// --- Ground plane (for raycasting) ---
const groundGeometry = new THREE.PlaneGeometry(10, 10);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x0a0a0a,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.name = 'ground';
scene.add(ground);

// --- Scene lighting ---
const ambientLight = new THREE.AmbientLight(0x444444);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

// --- Heatmap canvas overlay (interpolated, Phase 3) ---
function createHeatmapOverlay() {
  heatmapCanvas = document.createElement('canvas');
  heatmapCanvas.style.position = 'absolute';
  heatmapCanvas.style.top = '0';
  heatmapCanvas.style.left = '0';
  heatmapCanvas.style.width = '100%';
  heatmapCanvas.style.height = '100%';
  heatmapCanvas.style.pointerEvents = 'none';
  heatmapCanvas.width = container.clientWidth;
  heatmapCanvas.height = container.clientHeight;
  heatmapCtx = heatmapCanvas.getContext('2d');
  container.appendChild(heatmapCanvas);
}

function resizeHeatmapCanvas() {
  if (!heatmapCanvas) return;
  heatmapCanvas.width = container.clientWidth;
  heatmapCanvas.height = container.clientHeight;
}

// --- Map between screen coords and world coords ---
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

// --- Fixture creation ---
function createFixtureMesh(color, size) {
  const geometry = new THREE.CircleGeometry(size, 20);
  const material = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = 0.02;
  mesh.userData.isFixture = true;
  return mesh;
}

/** Create a rotation indicator arc for wall speakers */
function createOrientationIndicator() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  // Draw direction arrow
  ctx.beginPath();
  ctx.moveTo(28, 16);
  ctx.lineTo(4, 16);
  ctx.stroke();
  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(8, 10);
  ctx.lineTo(4, 16);
  ctx.lineTo(8, 22);
  ctx.stroke();
  // Arc showing coverage
  ctx.beginPath();
  ctx.arc(16, 16, 12, -Math.PI * 0.4, Math.PI * 0.4);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.6 });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(0.8, 0.8, 1);
  return sprite;
}

// --- Palette: pick a fixture type (with drag support) ---
function setupPalette() {
  const cards = document.querySelectorAll('.fixture-card');
  for (const card of cards) {
    card.addEventListener('click', () => {
      for (const c of cards) c.classList.remove('selected');
      card.classList.add('selected');
      updateActivePalette(card);
    });

    // --- HTML5 drag-from-palette (Phase 3) ---
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', (e) => {
      // Set active palette from this card
      updateActivePalette(card);
      e.dataTransfer.setData('text/plain', card.dataset.type);
      e.dataTransfer.effectAllowed = 'copy';
    });

    const params = card.querySelectorAll('input');
    for (const p of params) {
      p.addEventListener('change', () => {
        if (card.classList.contains('selected')) {
          updateActivePalette(card);
        }
      });
    }
  }

  // --- Rotation slider for wall speakers (Phase 3) ---
  const rotSlider = document.getElementById('rotation-slider');
  if (rotSlider) {
    rotSlider.addEventListener('input', () => {
      activeRotationAngle = parseInt(rotSlider.value);
      document.getElementById('rotation-value').textContent = `${activeRotationAngle}°`;
      // Update selected wall speaker rotation
      if (selectedObject) {
        const speaker = placedSpeakers.find(s => s.mesh === selectedObject);
        if (speaker && speaker.orientation) {
          speaker.orientation.h = activeRotationAngle;
          if (speaker.orientSprite) {
            speaker.orientSprite.rotation.z = activeRotationAngle * (Math.PI / 180);
          }
          updateSelectionInfo(speaker);
          scheduleRecalc();
        }
      }
    });
  }
}

function updateActivePalette(card) {
  const type = card.dataset.type;
  if (type === 'downlight') {
    const beam = parseInt(card.querySelector('.param-beam')?.value || '25');
    const watts = parseFloat(card.querySelector('.param-watts')?.value || '12');
    const isNarrow = card.dataset.ies === 'narrow';
    const halfBeam = beam / 2;
    const peakCd = watts * 90;

    activePaletteType = {
      type: 'fixture',
      label: card.querySelector('.fixture-label').textContent,
      iesData: buildParametricIES(peakCd, halfBeam),
      beamAngle: beam,
      watts,
      color: isNarrow ? 0xffaa00 : 0xffcc44,
      size: isNarrow ? 0.12 : 0.15,
    };
  } else if (type === 'speaker') {
    const sensitivity = parseFloat(card.querySelector('.param-sensitivity')?.value || '88');
    const power = parseFloat(card.querySelector('.param-power')?.value || '30');
    const isCeiling = card.dataset.speaker === 'ceiling';

    activePaletteType = {
      type: 'speaker',
      label: card.querySelector('.fixture-label').textContent,
      sensitivity: sensitivity,
      maxSPL: isCeiling ? 110 : 115,
      power: power,
      dispersionH: isCeiling ? 120 : 90,
      dispersionV: isCeiling ? 120 : 60,
      color: isCeiling ? 0x44aaff : 0x3388dd,
      size: isCeiling ? 0.18 : 0.20,
      isCeiling,
    };
  }
}

function buildParametricIES(peakCd, halfBeamDeg) {
  const angles = [];
  for (let i = 0; i <= 90; i++) angles.push(i);

  const candelas = [];
  const row = angles.map(a => {
    if (a <= halfBeamDeg) {
      const ratio = a / halfBeamDeg;
      return peakCd * Math.exp(-4 * ratio * ratio);
    }
    const outside = (a - halfBeamDeg) / (90 - halfBeamDeg);
    return peakCd * 0.02 * Math.exp(-2 * outside);
  });
  candelas.push(row);

  return {
    verticalAngles: angles,
    horizontalAngles: [0],
    candelas,
    metadata: {
      lampCount: 1,
      lumensPerLamp: Math.round(peakCd * 0.8),
      multiplier: 1,
      photometricType: 1,
      unitsType: 'meters',
      width: 0.1,
    },
  };
}

// --- Place fixture ---
function placeFixtureAt(worldPos) {
  if (!activePaletteType) return;

  if (activePaletteType.type === 'fixture') {
    const mesh = createFixtureMesh(activePaletteType.color, activePaletteType.size);
    mesh.position.set(worldPos.x, worldPos.y, 0.02);
    scene.add(mesh);

    placedFixtures.push({
      mesh,
      position: { x: worldPos.x, y: 0, z: 3 },
      orientation: { h: 0, v: 0 },
      iesData: activePaletteType.iesData,
      label: activePaletteType.label,
      beamAngle: activePaletteType.beamAngle,
      watts: activePaletteType.watts,
    });
  } else if (activePaletteType.type === 'speaker') {
    const mesh = createFixtureMesh(activePaletteType.color, activePaletteType.size);
    mesh.position.set(worldPos.x, worldPos.y, 0.02);
    scene.add(mesh);

    // Add orientation indicator for non-ceiling speakers (Phase 3)
    let orientSprite = null;
    if (!activePaletteType.isCeiling) {
      orientSprite = createOrientationIndicator();
      orientSprite.position.set(worldPos.x, worldPos.y, 0.05);
      orientSprite.rotation.z = activeRotationAngle * (Math.PI / 180);
      scene.add(orientSprite);
    }

    placedSpeakers.push({
      mesh,
      orientSprite,
      position: { x: worldPos.x, y: 0, z: 3 },
      orientation: { h: activeRotationAngle, v: 0 },
      sensitivity: activePaletteType.sensitivity,
      maxSPL: activePaletteType.maxSPL,
      power: activePaletteType.power,
      dispersionH: activePaletteType.dispersionH,
      dispersionV: activePaletteType.dispersionV,
      label: activePaletteType.label,
    });
  }

  scheduleRecalc();
  updateStats();
}

// --- IES file upload (Phase 3) ---
function setupIesUpload() {
  fileInputIES = document.createElement('input');
  fileInputIES.type = 'file';
  fileInputIES.accept = '.ies';
  fileInputIES.style.display = 'none';
  document.body.appendChild(fileInputIES);

  btnIesUpload.addEventListener('click', () => fileInputIES.click());

  fileInputIES.addEventListener('change', () => {
    if (fileInputIES.files.length > 0) {
      loadIesFile(fileInputIES.files[0]);
    }
  });

  // Also accept .ies drag-drop onto canvas area
  canvasArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    canvasArea.classList.add('drag-over');
  });
  canvasArea.addEventListener('dragleave', () => {
    canvasArea.classList.remove('drag-over');
  });
  canvasArea.addEventListener('drop', (e) => {
    e.preventDefault();
    canvasArea.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // Check if any .ies files
      for (const file of files) {
        if (file.name.endsWith('.ies')) {
          loadIesFile(file);
        } else if (file.type.startsWith('image/')) {
          loadFloorPlan(file);
        }
      }
    }
  });
}

function loadIesFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const iesData = parseIES(e.target.result);

      // Place the real IES fixture at origin (user can drag it later)
      // or fall back to parametric if no floor plan loaded
      const pos = placedFixtures.length > 0
        ? { x: room.xMin + 1 + placedFixtures.length * 1.5, y: room.yMin + 1 }
        : { x: 0, y: 0 };

      // Create a label from the IES metadata or filename
      const label = iesData.metadata.labels?.[0] || file.name.replace('.ies', '');

      // Compute a decent beam angle from the IES data
      const halfMax = Math.max(...iesData.candelas[0]) / 2;
      let beamAngle = 45;
      for (let i = 0; i < iesData.verticalAngles.length; i++) {
        if (iesData.candelas[0][i] < halfMax) {
          beamAngle = iesData.verticalAngles[i];
          break;
        }
      }

      const mesh = createFixtureMesh(0xffaa44, 0.14);
      mesh.position.set(pos.x, pos.y, 0.02);
      scene.add(mesh);

      placedFixtures.push({
        mesh,
        position: { x: pos.x, y: 0, z: 3 },
        orientation: { h: 0, v: 0 },
        iesData,  // Real parsed IES data
        label: `[IES] ${label}`,
        beamAngle,
        watts: Math.round(iesData.metadata.lumensPerLamp / 80 * 10) / 10, // rough lumen→watts
      });

      scheduleRecalc();
      updateStats();
    } catch (err) {
      selectionInfo.innerHTML = `<div class="sel-type" style="color:#c66">IES parse error: ${err.message}</div>`;
    }
  };
  reader.readAsText(file);
}

// ===== Phase 4: GLL Speaker Library Upload =====
function setupGllUpload() {
  const fileInputGLL = document.createElement('input');
  fileInputGLL.type = 'file';
  fileInputGLL.accept = '.json,.gll';
  fileInputGLL.style.display = 'none';
  document.body.appendChild(fileInputGLL);

  const btnGll = document.getElementById('btn-gll-upload');
  if (!btnGll) return;

  btnGll.addEventListener('click', () => fileInputGLL.click());
  fileInputGLL.addEventListener('change', () => {
    if (fileInputGLL.files.length > 0) {
      loadGllFile(fileInputGLL.files[0]);
    }
  });
}

function loadGllFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const { presets, errors } = parseGLLJson(e.target.result);

      if (errors.length > 0) {
        console.warn('GLL import warnings:', errors);
      }

      if (presets.length === 0) {
        selectionInfo.innerHTML = `<div class="sel-type" style="color:#c66">GLL import failed: ${errors.join('; ')}</div>`;
        return;
      }

      addImportedPresets(presets);
      updatePaletteWithGLL(presets);

      selectionInfo.innerHTML = `<div class="sel-type" style="color:#6c6">Imported ${presets.length} speaker(s)</div>
        ${errors.length > 0 ? `<div class="sel-param" style="color:#cc6;font-size:0.65rem;">Warnings: ${errors.join('; ')}</div>` : ''}
        <div class="sel-param" style="font-size:0.65rem;color:#666">${presets.map(p => p.manufacturer + ' ' + p.model).join(', ')}</div>`;
    } catch (err) {
      selectionInfo.innerHTML = `<div class="sel-type" style="color:#c66">GLL error: ${err.message}</div>`;
    }
  };
  reader.readAsText(file);
}

/**
 * Add imported GLL speaker presets as draggable cards in the palette.
 */
function updatePaletteWithGLL(presets) {
  const palette = document.getElementById('palette');
  if (!palette) return;

  // Find or create the imported group
  let importGroup = palette.querySelector('.fixture-group.imported-group');
  if (!importGroup) {
    importGroup = document.createElement('div');
    importGroup.className = 'fixture-group imported-group';
    const heading = document.createElement('h3');
    heading.textContent = 'Imported';
    importGroup.appendChild(heading);
    palette.appendChild(importGroup);
  }

  for (const p of presets) {
    const card = document.createElement('div');
    card.className = 'fixture-card';
    card.dataset.type = p.type === 'ceiling' ? 'speaker' : 'speaker';
    card.dataset.speaker = p.type;
    card.dataset.gllId = p.id;

    const iconEmoji = p.type === 'sub' ? '🔊' : p.type === 'line' ? '📢' : '🔉';
    card.innerHTML = `
      <div class="fixture-icon">${iconEmoji}</div>
      <div class="fixture-label">${p.manufacturer} ${p.model}</div>
      <div class="fixture-params">
        <label>Sensitivity: <input type="number" value="${p.sensitivity}" class="param-sensitivity"> dB</label>
        <label>Power: <input type="number" value="${p.power}" class="param-power"> W</label>
      </div>
    `;

    // Click to select
    card.addEventListener('click', () => {
      document.querySelectorAll('.fixture-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      activePaletteType = {
        type: 'speaker',
        label: `${p.manufacturer} ${p.model}`,
        sensitivity: p.sensitivity,
        maxSPL: p.maxSPL,
        power: p.power,
        dispersionH: p.dispersionH,
        dispersionV: p.dispersionV,
        color: new THREE.Color(p.color || '#44aaff').getHex(),
        size: p.type === 'sub' ? 0.25 : (p.type === 'line' ? 0.15 : 0.18),
        isCeiling: p.type === 'ceiling',
        gllId: p.id,
      };
    });

    // Drag support
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', (e) => {
      card.click(); // activate this preset
      e.dataTransfer.setData('text/plain', 'speaker');
      e.dataTransfer.effectAllowed = 'copy';
    });

    // Param changes
    card.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => {
        if (card.classList.contains('selected')) {
          card.click();
        }
      });
    });

    importGroup.appendChild(card);
  }
}


// --- Floor plan upload ---
function setupFloorPlanUpload() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  btnUpload.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      loadFloorPlan(fileInput.files[0]);
    }
  });

  placeholder.addEventListener('click', () => fileInput.click());
}

function loadFloorPlan(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      loadFloorPlanImage(img);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Load a floor plan image onto the Three.js ground plane.
 * Shared between upload and project deserialisation.
 */
function loadFloorPlanImage(img) {
  if (floorPlanMesh) {
    scene.remove(floorPlanMesh);
    floorPlanMesh.geometry.dispose();
    floorPlanMesh.material.dispose();
  }

  const texture = new THREE.Texture(img);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const aspect = img.width / img.height;
  let planW = 10;
  let planH = 10 / aspect;
  if (planH > 10) {
    planH = 10;
    planW = 10 * aspect;
  }

  const geometry = new THREE.PlaneGeometry(planW, planH);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: false,
  });
  floorPlanMesh = new THREE.Mesh(geometry, material);
  floorPlanMesh.rotation.x = -Math.PI / 2;
  floorPlanMesh.position.y = 0;
  floorPlanMesh.name = 'floor-plan';
  scene.add(floorPlanMesh);

  room.xMin = -planW / 2;
  room.xMax = planW / 2;
  room.yMin = -planH / 2;
  room.yMax = planH / 2;

  groundGeometry.dispose();
  const newGround = new THREE.PlaneGeometry(planW, planH);
  ground.geometry.copy(newGround);
  ground.scale.set(1, 1, 1);

  gridHelper.position.y = 0.001;
  gridHelper.scale.set(planW / 10, 1, planH / 10);

  placeholder.style.display = 'none';
  container.style.display = 'block';

  texture.needsUpdate = true;
  scheduleRecalc();
}

// --- Click-to-place (with drag detection) ---
function setupClickToPlace() {
  container.addEventListener('click', (e) => {
    if (isDragging) {
      isDragging = false;
      return;
    }

    const worldPos = screenToWorld(e.clientX, e.clientY);
    if (!worldPos || !activePaletteType) return;

    placeFixtureAt(worldPos);
  });

  // Drag detection for OrbitControls compatibility
  let pointerDown = null;
  container.addEventListener('pointerdown', (e) => {
    pointerDown = { x: e.clientX, y: e.clientY };
  });
  container.addEventListener('pointerup', (e) => {
    if (pointerDown) {
      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      isDragging = Math.sqrt(dx * dx + dy * dy) > 5;
      pointerDown = null;
    }
  });

  // --- Drag-from-palette: drop handler (Phase 3) ---
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const worldPos = screenToWorld(e.clientX, e.clientY);
    if (!worldPos) return;

    // Check if a palette card was dragged (has activePaletteType)
    if (activePaletteType) {
      placeFixtureAt(worldPos);
    }
  });
}

// --- Selection ---
function setupSelection() {
  container.addEventListener('click', (e) => {
    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const meshes = [
      ...placedFixtures.map(f => f.mesh),
      ...placedSpeakers.map(s => s.mesh),
    ];
    const intersects = raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      const hit = intersects[0].object;

      if (selectedObject) {
        selectedObject.material.color.setHex(selectedObject.userData.origColor || 0xffffff);
      }

      selectedObject = hit;
      hit.userData.origColor = hit.material.color.getHex();
      hit.material.color.setHex(0xffffff);

      const fixture = placedFixtures.find(f => f.mesh === hit);
      if (fixture) {
        updateSelectionInfo(fixture);
      } else {
        const speaker = placedSpeakers.find(s => s.mesh === hit);
        if (speaker) updateSelectionInfo(speaker);
      }

      e.stopPropagation();
      return;
    }

    if (selectedObject) {
      selectedObject.material.color.setHex(selectedObject.userData.origColor || 0xffffff);
      selectedObject = null;
      selectionInfo.innerHTML = '—';
      // Hide rotation slider
      const rotGroup = document.getElementById('rotation-group');
      if (rotGroup) rotGroup.style.display = 'none';
    }
  });
}

function updateSelectionInfo(item) {
  const fixture = item.iesData ? item : null;
  const speaker = item.sensitivity !== undefined ? item : null;

  if (fixture) {
    const iesLabel = fixture.iesData?.metadata?.labels?.[0] || '';
    selectionInfo.innerHTML = `
      <div class="sel-type">${fixture.label || 'Light'}</div>
      <div class="sel-pos">Position: (${fixture.position.x.toFixed(1)}, ${fixture.position.y.toFixed(1)})</div>
      <div class="sel-param">Beam: ${fixture.beamAngle || '?'}°</div>
      <div class="sel-param">Watts: ${fixture.watts || '?'}W</div>
      ${iesLabel ? `<div class="sel-param" style="font-size:0.65rem;color:#666">${iesLabel}</div>` : ''}
      <button class="btn btn-danger btn-small" data-action="delete-selected">Delete</button>
    `;
    // Hide rotation slider (not applicable to lights)
    const rotGroup = document.getElementById('rotation-group');
    if (rotGroup) rotGroup.style.display = 'none';
  } else if (speaker) {
    selectionInfo.innerHTML = `
      <div class="sel-type">${speaker.label || 'Speaker'}</div>
      <div class="sel-pos">Position: (${speaker.position.x.toFixed(1)}, ${speaker.position.y.toFixed(1)})</div>
      <div class="sel-param">Sensitivity: ${speaker.sensitivity}dB</div>
      <div class="sel-param">Power: ${speaker.power}W</div>
      <div class="sel-param">Dispersion: ${speaker.dispersionH}° × ${speaker.dispersionV}°</div>
      <div class="sel-param">Orientation: ${speaker.orientation.h}°</div>
      <button class="btn btn-danger btn-small" data-action="delete-selected">Delete</button>
    `;

    // Show rotation slider for wall speakers (Phase 3)
    if (speaker.dispersionH !== 120) { // not ceiling
      const rotGroup = document.getElementById('rotation-group');
      if (rotGroup) {
        rotGroup.style.display = 'block';
        const slider = document.getElementById('rotation-slider');
        if (slider) slider.value = speaker.orientation.h;
        const val = document.getElementById('rotation-value');
        if (val) val.textContent = `${speaker.orientation.h}°`;
      }
    }
  }

  const delBtn = selectionInfo.querySelector('[data-action="delete-selected"]');
  if (delBtn) delBtn.addEventListener('click', deleteSelected);
}

function deleteSelected() {
  if (!selectedObject) return;

  const fi = placedFixtures.findIndex(f => f.mesh === selectedObject);
  if (fi !== -1) {
    scene.remove(placedFixtures[fi].mesh);
    placedFixtures[fi].mesh.geometry.dispose();
    placedFixtures[fi].mesh.material.dispose();
    placedFixtures.splice(fi, 1);
  } else {
    const si = placedSpeakers.findIndex(s => s.mesh === selectedObject);
    if (si !== -1) {
      scene.remove(placedSpeakers[si].mesh);
      placedSpeakers[si].mesh.geometry.dispose();
      placedSpeakers[si].mesh.material.dispose();
      // Remove orientation sprite if present
      if (placedSpeakers[si].orientSprite) {
        scene.remove(placedSpeakers[si].orientSprite);
      }
      placedSpeakers.splice(si, 1);
    }
  }

  selectedObject = null;
  selectionInfo.innerHTML = '—';
  scheduleRecalc();
  updateStats();
}

// --- Phase 3: Interpolated heatmap rendering ---
function scheduleRecalc() {
  if (recalcTimeout) clearTimeout(recalcTimeout);
  recalcTimeout = setTimeout(renderHeatmap, RECALC_DEBOUNCE_MS);
}

function renderHeatmap() {
  if (placedFixtures.length === 0 && placedSpeakers.length === 0) {
    if (heatmapCtx) {
      heatmapCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
    }
    return;
  }

  if (!heatmapCtx) return;

  const density = Math.min(
    40,
    Math.max(20, Math.floor(300 / (placedFixtures.length + placedSpeakers.length + 1)))
  );
  const samples = sampleGrid(room, density, placedFixtures, placedSpeakers);

  const w = heatmapCanvas.width;
  const h = heatmapCanvas.height;

  let pixelData;

  if (activeMode === 'lux' || activeMode === 'spl') {
    const field = activeMode === 'lux' ? 'lux' : 'spl';
    pixelData = renderInterpolatedHeatmap(samples, field, w, h, room, density);
  } else {
    const compositeMode = activeMode === 'overlay' ? 'overlay' : 'maximum';
    pixelData = renderCompositeInterpolated(samples, compositeMode, w, h, room, density);
  }

  const imageData = new ImageData(pixelData, w, h);
  heatmapCtx.clearRect(0, 0, w, h);
  heatmapCtx.putImageData(imageData, 0, 0);
}

// --- Stats update ---
function updateStats() {
  statFixtures.textContent = placedFixtures.length;
  statSpeakers.textContent = placedSpeakers.length;

  const density = Math.max(15, Math.floor(200 / (placedFixtures.length + placedSpeakers.length + 1)));
  const samples = sampleGrid(room, density, placedFixtures, placedSpeakers);

  let avgLux = 0, avgSpl = 0;
  for (const s of samples) {
    avgLux += s.lux;
    avgSpl += s.spl;
  }
  avgLux = samples.length > 0 ? avgLux / samples.length : 0;
  avgSpl = samples.length > 0 ? avgSpl / samples.length : 0;

  statLux.textContent = avgLux > 0 ? `${avgLux.toFixed(0)} lux` : '—';
  statSpl.textContent = avgSpl > 0 ? `${avgSpl.toFixed(1)} dB` : '—';
}

// --- Mode toggle ---
function setMode(mode) {
  activeMode = mode;
  btnLux.classList.toggle('active', mode === 'lux');
  btnSpl.classList.toggle('active', mode === 'spl');
  btnComposite.classList.toggle('active', mode === 'overlay' || mode === 'maximum');
  scheduleRecalc();
}

function setupModeToggle() {
  btnLux.addEventListener('click', () => setMode('lux'));
  btnSpl.addEventListener('click', () => setMode('spl'));
  btnComposite.addEventListener('click', () => {
    if (activeMode === 'overlay') {
      setMode('maximum');
    } else {
      setMode('overlay');
    }
  });
}

// --- BOM export ---
function setupBomExport() {
  btnExportBom.addEventListener('click', exportBom);
}

// ===== Phase 4: Project Save / Load (localStorage) =====

const STORAGE_KEY = 'grainworks_audio_lighting_project';
const SAVED_PROJECTS_KEY = 'grainworks_saved_projects';

function getSavedProjectList() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_PROJECTS_KEY)) || [];
  } catch { return []; }
}

function setSavedProjectList(list) {
  localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(list));
}

function serialiseProject() {
  // Core state: fixtures and speakers
  const fixtures = placedFixtures.map(f => ({
    type: 'fixture',
    position: { ...f.position },
    orientation: { ...f.orientation },
    label: f.label,
    beamAngle: f.beamAngle,
    watts: f.watts,
    // IES data (serialisable)
    iesData: f.iesData ? {
      verticalAngles: f.iesData.verticalAngles,
      horizontalAngles: f.iesData.horizontalAngles,
      candelas: f.iesData.candelas,
      metadata: f.iesData.metadata,
    } : null,
    // World position on the ground plane
    worldX: f.mesh.position.x,
    worldY: f.mesh.position.y,
  }));

  const speakers = placedSpeakers.map(s => ({
    type: 'speaker',
    position: { ...s.position },
    orientation: { ...s.orientation },
    label: s.label,
    sensitivity: s.sensitivity,
    maxSPL: s.maxSPL,
    power: s.power,
    dispersionH: s.dispersionH,
    dispersionV: s.dispersionV,
    isCeiling: s.orientation.h === 0 && s.dispersionH === 120,
    worldX: s.mesh.position.x,
    worldY: s.mesh.position.y,
  }));

  // Floor plan image: capture current canvas as data URL
  let floorPlanDataURL = null;
  if (floorPlanMesh && floorPlanMesh.material.map) {
    const img = floorPlanMesh.material.map.image;
    if (img && img.src && img.src.startsWith('data:')) {
      floorPlanDataURL = img.src;
    }
  }

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    room: { ...room },
    activeMode,
    floorPlanDataURL,
    fixtures,
    speakers,
  };
}

function deserialiseProject(data, projectName) {
  // Clear existing
  clearAllFixtures();

  // Restore floor plan
  if (data.floorPlanDataURL) {
    const img = new Image();
    img.onload = () => {
      loadFloorPlanImage(img);
      // After floor plan loads, place fixtures
      setTimeout(() => placeDeserialisedFixtures(data), 100);
    };
    img.src = data.floorPlanDataURL;
  } else {
    placeDeserialisedFixtures(data);
  }

  if (data.activeMode) {
    setMode(data.activeMode);
  }

  // Update project name
  const pn = document.getElementById('project-name');
  if (pn) pn.textContent = projectName ? `— ${projectName}` : '—';
}

function clearAllFixtures() {
  for (const f of placedFixtures) {
    scene.remove(f.mesh);
    f.mesh.geometry.dispose();
    f.mesh.material.dispose();
  }
  placedFixtures.length = 0;

  for (const s of placedSpeakers) {
    scene.remove(s.mesh);
    s.mesh.geometry.dispose();
    s.mesh.material.dispose();
    if (s.orientSprite) {
      scene.remove(s.orientSprite);
    }
  }
  placedSpeakers.length = 0;

  // Clear heatmap
  if (heatmapCtx) {
    heatmapCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
  }

  selectedObject = null;
  selectionInfo.innerHTML = '—';
  updateStats();
}

function placeDeserialisedFixtures(data) {
  if (!data.fixtures) return;

  for (const fd of data.fixtures) {
    const mesh = createFixtureMesh(fd.iesData ? 0xffaa44 : 0xffcc44, fd.beamAngle > 60 ? 0.15 : 0.12);
    mesh.position.set(fd.worldX, fd.worldY, 0.02);
    scene.add(mesh);

    placedFixtures.push({
      mesh,
      position: fd.position,
      orientation: fd.orientation,
      iesData: fd.iesData || null,
      label: fd.label,
      beamAngle: fd.beamAngle,
      watts: fd.watts,
    });
  }

  for (const sd of data.speakers) {
    const mesh = createFixtureMesh(sd.isCeiling ? 0x44aaff : 0x3388dd, sd.isCeiling ? 0.18 : 0.20);
    mesh.position.set(sd.worldX, sd.worldY, 0.02);
    scene.add(mesh);

    let orientSprite = null;
    if (!sd.isCeiling) {
      orientSprite = createOrientationIndicator();
      orientSprite.position.set(sd.worldX, sd.worldY, 0.05);
      orientSprite.rotation.z = (sd.orientation?.h || 0) * (Math.PI / 180);
      scene.add(orientSprite);
    }

    placedSpeakers.push({
      mesh,
      orientSprite,
      position: sd.position,
      orientation: sd.orientation || { h: 0, v: 0 },
      sensitivity: sd.sensitivity,
      maxSPL: sd.maxSPL,
      power: sd.power,
      dispersionH: sd.dispersionH,
      dispersionV: sd.dispersionV,
      label: sd.label,
    });
  }

  scheduleRecalc();
  updateStats();
}

function setupProjectPersistence() {
  const btnSave = document.getElementById('btn-save-project');
  const btnLoad = document.getElementById('btn-load-project');
  const btnNew = document.getElementById('btn-new-project');

  btnSave.addEventListener('click', saveProjectDialog);
  btnLoad.addEventListener('click', loadProjectDialog);
  btnNew.addEventListener('click', () => {
    if (placedFixtures.length === 0 && placedSpeakers.length === 0) return;
    if (confirm('Clear all fixtures and start a new project?')) {
      if (floorPlanMesh) {
        scene.remove(floorPlanMesh);
        floorPlanMesh.geometry.dispose();
        floorPlanMesh.material.dispose();
        floorPlanMesh = null;
      }
      clearAllFixtures();
      placeholder.style.display = 'flex';
      container.style.display = 'none';
      document.getElementById('project-name').textContent = '—';
    }
  });

  // Restore last project on page load
  try {
    const lastProject = localStorage.getItem(STORAGE_KEY);
    if (lastProject) {
      const data = JSON.parse(lastProject);
      if (data && data.fixtures && data.fixtures.length > 0) {
        deserialiseProject(data, 'Auto-restored');
      }
    }
  } catch {}
}

function saveProjectDialog() {
  const name = prompt('Project name:', 'My Project');
  if (!name || !name.trim()) return;

  const data = serialiseProject();
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Save as named project
  const list = getSavedProjectList();
  const existing = list.findIndex(p => p.slug === slug);
  const entry = { slug, name: name.trim(), savedAt: data.savedAt, data };

  if (existing >= 0) {
    list[existing] = entry;
  } else {
    list.push(entry);
  }
  setSavedProjectList(list);

  // Also set as current auto-restore
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  document.getElementById('project-name').textContent = `— ${name.trim()}`;
}

function loadProjectDialog() {
  const list = getSavedProjectList();
  if (list.length === 0) {
    alert('No saved projects found.');
    return;
  }

  // Build a simple picker UI
  const picker = document.createElement('div');
  picker.className = 'modal-overlay';
  picker.innerHTML = `
    <div class="modal-box">
      <h2>Load Project</h2>
      <div class="project-list">
        ${list.map((p, i) => `
          <div class="project-item" data-index="${i}">
            <strong>${p.name}</strong>
            <span class="project-date">${new Date(p.savedAt).toLocaleDateString()} ${new Date(p.savedAt).toLocaleTimeString()}</span>
          </div>
        `).join('')}
      </div>
      <button id="btn-modal-close" class="btn btn-secondary" style="margin-top:12px;">Cancel</button>
    </div>
  `;
  document.body.appendChild(picker);

  picker.querySelectorAll('.project-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      const entry = list[idx];
      deserialiseProject(entry.data, entry.name);
      // Set auto-restore
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry.data));
      document.body.removeChild(picker);
    });
  });

  picker.querySelector('#btn-modal-close').addEventListener('click', () => {
    document.body.removeChild(picker);
  });

  picker.addEventListener('click', (e) => {
    if (e.target === picker) document.body.removeChild(picker);
  });
}

// ===== Phase 4: Perspective 3D View Toggle =====

let viewMode = 'ortho'; // 'ortho' | 'persp'
let currentCamera = camera;

function setupViewToggle() {
  // Add toggle button to toolbar
  const controlsDiv = document.querySelector('.controls');
  const spacer = document.createElement('span');
  spacer.className = 'separator';
  controlsDiv.appendChild(spacer);

  const btn3d = document.createElement('button');
  btn3d.id = 'btn-3d-toggle';
  btn3d.className = 'btn btn-secondary';
  btn3d.title = 'Toggle between 2D top-down and 3D perspective view';
  btn3d.textContent = '3D Off';
  controlsDiv.appendChild(btn3d);

  btn3d.addEventListener('click', () => {
    toggleView();
    btn3d.textContent = viewMode === 'persp' ? '3D On' : '3D Off';
  });

  // Also add keyboard shortcut: press Z to toggle
}

function toggleView() {
  if (viewMode === 'ortho') {
    // Switch to perspective
    const w = container.clientWidth;
    const h = container.clientHeight;
    const aspect = w / h;

    const perspCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
    // Position camera at an elevated angle looking down at the scene center
    const radius = 15;
    perspCamera.position.set(0, radius * 0.6, radius * 0.8);
    perspCamera.lookAt(0, 0, 0);

    // Swap camera
    scene.remove(scene.children.find(c => c.isCamera)?.parent); // no-op, just swap the renderer camera
    currentCamera = perspCamera;
    controls.object = perspCamera;
    controls.enableRotate = true;
    controls.target.set(0, 0, 0);
    controls.update();

    viewMode = 'persp';
  } else {
    // Switch back to orthographic
    const w = container.clientWidth;
    const h = container.clientHeight;
    const aspect = w / h;

    const orthoCamera = new THREE.OrthographicCamera(
      -viewSize * aspect, viewSize * aspect,
      viewSize, -viewSize,
      0.1, 100
    );
    orthoCamera.position.set(0, 10, 0);
    orthoCamera.lookAt(0, 0, 0);

    currentCamera = orthoCamera;
    controls.object = orthoCamera;
    controls.enableRotate = false;
    controls.target.set(0, 0, 0);
    controls.update();

    viewMode = 'ortho';
  }

  // Update the renderer accordingly
  scheduleRecalc();
}

function exportBom() {
  if (placedFixtures.length === 0 && placedSpeakers.length === 0) return;

  let csv = 'Type,Label,Position X,Position Y,Orientation,Parameters\n';

  for (const f of placedFixtures) {
    const iesDesc = f.iesData?.metadata?.labels?.[0]
      ? ` IES:${f.iesData.metadata.labels[0].slice(0, 40)}`
      : '';
    csv += `Fixture,${f.label || 'Light'},${f.position.x.toFixed(2)},${f.position.y.toFixed(2)},0°,"Beam:${f.beamAngle || '?'}°, Watts:${f.watts || '?'}W${iesDesc}"\n`;
  }

  for (const s of placedSpeakers) {
    csv += `Speaker,${s.label || 'Speaker'},${s.position.x.toFixed(2)},${s.position.y.toFixed(2)},${s.orientation.h}°,"Sensitivity:${s.sensitivity}dB, Power:${s.power}W, Dispersion:${s.dispersionH}°×${s.dispersionV}°"\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'audio-lighting-bom.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// --- Resize ---
function onResize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  const aspect = w / h;
  camera.left = -viewSize * aspect;
  camera.right = viewSize * aspect;
  camera.top = viewSize;
  camera.bottom = -viewSize;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  resizeHeatmapCanvas();
  scheduleRecalc();
}

window.addEventListener('resize', onResize);

// --- Keyboard shortcuts ---
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedObject) { deleteSelected(); e.preventDefault(); }
    }
    if (e.key === '1') btnLux.click();
    if (e.key === '2') btnSpl.click();
    if (e.key === '3') btnComposite.click();
    // R to rotate selected wall speaker by 15° (Phase 3)
    if (e.key === 'r' || e.key === 'R') {
      if (selectedObject) {
        const speaker = placedSpeakers.find(s => s.mesh === selectedObject);
        if (speaker && speaker.orientation) {
          speaker.orientation.h = (speaker.orientation.h + 15) % 360;
          if (speaker.orientSprite) {
            speaker.orientSprite.rotation.z = speaker.orientation.h * (Math.PI / 180);
          }
          updateSelectionInfo(speaker);
          scheduleRecalc();
        }
      }
    }
    // Z to toggle 3D perspective view (Phase 4)
    if (e.key === 'z' || e.key === 'Z') {
      const btn3d = document.getElementById('btn-3d-toggle');
      if (btn3d) btn3d.click();
      e.preventDefault();
    }
  });
}

// --- Animation loop ---
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, currentCamera || camera);
}

// --- Init ---
function init() {
  createHeatmapOverlay();
  setupPalette();
  setupFloorPlanUpload();
  setupIesUpload();
  setupClickToPlace();
  setupSelection();
  setupModeToggle();
  setupBomExport();
  setupKeyboard();

  // Phase 4
  setupProjectPersistence();
  setupViewToggle();
  setupGllUpload();

  placeholder.style.display = 'flex';
  container.style.display = 'none';

  animate();
}

init();
