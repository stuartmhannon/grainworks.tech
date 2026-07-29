/**
 * heatmap.js — Zone-filtered coverage heatmap
 *
 * Wraps the v1 simulation modules. Filters by zone when a zone is selected.
 * Resolution and sensitivity are user-controllable via sliders.
 *
 * Layer toggle is handled externally (toolbar.js sets active layer).
 * This module only renders what it's told.
 */

import { getZone, getAllFixtures, getAllSpeakers, getMountHeight, getProject } from './state.js';
import { calculateIlluminance } from '../lib/lighting.js';
import { calculateSPL } from '../lib/acoustic.js';
import { pointInPolygon } from './zones.js';

let activeMode = 'lux';         // 'lux' | 'spl' | 'both'
let resolution = 2;             // cells per foot (default)
let sensitivity = 1.0;          // multiplier (0.5 - 2.0)
let zoneFilter = null;          // zoneId or null (show all)
let canvas = null;
let ctx = null;
let needsRecalc = true;
let recalcTimeout = null;

// Heatmap grid state
let gridData = null;            // { grid: Float64Array, width, height, min, max }

export function init(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
}

export function setResolution(cellsPerFoot) {
  resolution = Math.max(0.5, Math.min(10, cellsPerFoot));
  requestRecalc();
}

export function setSensitivity(mult) {
  sensitivity = Math.max(0.1, Math.min(5, mult));
  requestRecalc();
}

export function setMode(mode) {
  activeMode = mode;
  requestRecalc();
}

export function getMode() { return activeMode; }
export function getResolution() { return resolution; }
export function getSensitivity() { return sensitivity; }

export function setZoneFilter(zoneId) {
  zoneFilter = zoneId;
  requestRecalc();
}

export function clearZoneFilter() {
  zoneFilter = null;
  requestRecalc();
}

export function requestRecalc() {
  needsRecalc = true;
  if (recalcTimeout) clearTimeout(recalcTimeout);
  recalcTimeout = setTimeout(doRecalc, 100);
}

function doRecalc() {
  if (!canvas || !ctx) return;
  recalcTimeout = null;
  if (!needsRecalc) return;
  needsRecalc = false;

  const cal = getProject().calibration;
  if (!cal) { clearCanvas(); return; }

  const w = canvas.width;
  const h = canvas.height;
  const cellsX = Math.ceil(w / (cal.pixelsPerFoot / resolution));
  const cellsY = Math.ceil(h / (cal.pixelsPerFoot / resolution));

  // Get entities, filtered by zone if set
  let fixtures = getAllFixtures();
  let speakers = getAllSpeakers();

  if (zoneFilter) {
    fixtures = fixtures.filter(f => f.zoneId === zoneFilter);
    speakers = speakers.filter(f => f.zoneId === zoneFilter);
  }

  // Sample points in world space
  const samples = [];
  const stepWorld = 1 / resolution;

  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const wx = cx * stepWorld + stepWorld / 2;
      const wy = cy * stepWorld + stepWorld / 2;

      let lux = 0, spl = 0;

      // Sum contributions
      for (const f of fixtures) {
        const model = getProject().modelLibrary[f.entity.modelKey];
        const params = model ? model.params : { beamAngle: 45, wattage: 10, lumens: 800 };
        const mh = getMountHeight(f.entity);
        lux += calculateIlluminance(
          { position: f.entity.position },
          { x: wx, y: wy },
          mh,
          params.beamAngle || 45,
          params.lumens || 800
        );
      }

      for (const s of speakers) {
        const model = getProject().modelLibrary[s.entity.modelKey];
        const params = model ? model.params : { sensitivity: 88, maxSPL: 110, power: 30, dispersion: 120 };
        const mh = getMountHeight(s.entity);
        const result = calculateSPL(
          {
            position: { x: s.entity.position.x, y: s.entity.position.y, z: mh },
            sensitivity: params.sensitivity || 88,
            maxSPL: params.maxSPL || 110,
            power: params.power || 30,
            dispersionH: params.dispersion || 120,
            dispersionV: params.dispersion || 120,
          },
          { x: wx, y: wy }
        );
        spl += result.spl;
      }

      lux *= sensitivity;
      samples.push({ x: wx, y: wy, lux, spl });
    }
  }

  // Render heatmap
  renderHeatmap(samples, cellsX, cellsY, stepWorld, cal.pixelsPerFoot, w, h);
}

export function renderHeatmap(samples, cellsX, cellsY, stepWorld, pxPerFt, canvasW, canvasH) {
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Get active zone boundary for masking
  let activeBoundary = null;
  if (zoneFilter) {
    const zone = getZone(zoneFilter);
    if (zone) activeBoundary = zone.boundary;
  }

  // Find value range for current mode
  let values;
  if (activeMode === 'lux') {
    values = samples.map(s => s.lux);
  } else if (activeMode === 'spl') {
    values = samples.map(s => s.spl);
  } else {
    // 'both' — average normalized
    const maxLux = Math.max(...samples.map(s => s.lux), 1);
    const maxSpl = Math.max(...samples.map(s => s.spl), 1);
    values = samples.map(s => (s.lux / maxLux + s.spl / maxSpl) / 2);
  }

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  const cellPx = stepWorld * pxPerFt;
  const halfPx = cellPx / 2;

  for (let i = 0; i < samples.length; i++) {
    const norm = (values[i] - min) / range;
    const color = valueToColor(norm, activeMode);

    // World coords to screen
    const sx = samples[i].x * pxPerFt;
    const sy = samples[i].y * pxPerFt;

    // Mask: skip samples outside the active zone boundary
    if (activeBoundary && !pointInPolygon(samples[i].x, samples[i].y, activeBoundary)) {
      continue;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, halfPx * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function valueToColor(norm, mode) {
  // Clamp
  const v = Math.max(0, Math.min(1, norm));

  if (mode === 'lux') {
    // Blue (dim) → Green → Red (bright)
    if (v < 0.5) {
      const t = v * 2;
      return `rgb(${Math.round(t * 40)}, ${Math.round(t * 200)}, ${Math.round((1 - t) * 200)})`;
    } else {
      const t = (v - 0.5) * 2;
      return `rgb(${Math.round(40 + t * 215)}, ${Math.round(200 - t * 160)}, ${Math.round(0)})`;
    }
  } else if (mode === 'spl') {
    // Blue (quiet) → Cyan → Yellow → Red (loud)
    if (v < 0.33) {
      const t = v * 3;
      return `rgb(${Math.round(t * 40)}, ${Math.round(t * 200)}, ${Math.round(200)})`;
    } else if (v < 0.66) {
      const t = (v - 0.33) * 3;
      return `rgb(${Math.round(40 + t * 215)}, ${Math.round(200)}, ${Math.round(200 - t * 200)})`;
    } else {
      const t = (v - 0.66) * 3;
      return `rgb(${Math.round(255)}, ${Math.round(200 - t * 200)}, ${Math.round(0)})`;
    }
  } else {
    // Both — warm scale
    return `rgb(${Math.round(40 + v * 215)}, ${Math.round(v * 180)}, ${Math.round((1 - v) * 120)})`;
  }
}

function clearCanvas() {
  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
