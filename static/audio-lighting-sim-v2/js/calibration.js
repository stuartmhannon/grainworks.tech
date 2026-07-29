/**
 * calibration.js — Ruler tool (click-two-points scale calibration)
 *
 * State machine:
 *   IDLE → user clicks "Calibrate" → CALIBRATING → two clicks → prompt length → set scale
 *
 * Calibration must be done before zone drawing or entity placement.
 * The scale bar updates live on the canvas.
 */

import { setCalibration, pixelsToFeet, getProject } from './state.js';

let mode = 'idle';           // 'idle' | 'calibrating'
let points = [];
let tempLine = null;         // Three.js line object (managed by app.js)
let tempLabel = null;        // label sprite (managed by app.js)
let onComplete = null;

export function isCalibrated() {
  return getProject().calibration !== null;
}

export function isCalibrating() {
  return mode === 'calibrating';
}

export function startCalibration() {
  mode = 'calibrating';
  points = [];
  showStatus('Click two points on the floor plan to set scale');
}

export function cancelCalibration() {
  mode = 'idle';
  points = [];
  clearTempGraphics();
  showStatus('');
}

export function getMode() { return mode; }

/** Called by app.js on floor plan click during calibration mode.
 *  `worldX, worldY` are Three.js world-space coordinates.
 *  `floorPlanPixels` ({ naturalW, naturalH, worldH }) gives the conversion
 *  from world-space to floor-plan-image pixel space.
 */
export function handleClick(worldX, worldY, floorPlanPixels) {
  if (mode !== 'calibrating') return null;

  // Convert world-space coords to floor-plan image pixel coords.
  // The floor plan image (naturalW x naturalH) is mapped onto a ground
  // plane of worldH units in height, with aspect-ratio width.
  // So each pixel on the image = worldH / naturalH world units.
  let px, py;
  if (floorPlanPixels) {
    const worldH = floorPlanPixels.worldH || 10;
    const scaleX = floorPlanPixels.naturalW / (worldH * (floorPlanPixels.naturalW / floorPlanPixels.naturalH));
    const scaleY = floorPlanPixels.naturalH / worldH;
    px = (worldX / (worldH * (floorPlanPixels.naturalW / floorPlanPixels.naturalH)) + 0.5) * floorPlanPixels.naturalW;
    py = (-worldY / worldH + 0.5) * floorPlanPixels.naturalH;
  } else {
    // Fallback: treat world coords as raw pixels
    px = worldX;
    py = worldY;
  }

  points.push({ x: px, y: py });

  if (points.length === 1) {
    updateTempLine(points[0], points[0]);
    showStatus('First point set. Click a second point at the other end of a known-length wall.');
    return null;
  }

  // Second point — compute pixel distance on the floor plan image
  const dx = points[1].x - points[0].x;
  const dy = points[1].y - points[0].y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);

  return {
    type: 'complete',
    p1: points[0],
    p2: points[1],
    pixelDist,
  };
}

export function confirmCalibration(p1, p2, realLengthFeet) {
  setCalibration(p1, p2, realLengthFeet);
  mode = 'idle';
  clearTempGraphics();
  showStatus(`Scale set: ${realLengthFeet}' wall = ${getProject().calibration.pixelsPerFoot.toFixed(1)} px/ft`);

  // Auto-dismiss status after 3s
  setTimeout(() => showStatus(''), 3000);
}

export function getScaleBar(lengthFeet = 10) {
  if (!isCalibrated()) return null;
  return {
    lengthFeet,
    lengthPixels: lengthFeet * getProject().calibration.pixelsPerFoot,
    label: `${lengthFeet}'`,
  };
}

// --- Temp graphics helpers (called from app.js) ---

let _tempLineObj = null;
let _tempLabelObj = null;
let _statusEl = null;

export function initStatusDisplay(elementId) {
  _statusEl = document.getElementById(elementId);
}

function showStatus(msg) {
  if (_statusEl) _statusEl.textContent = msg;
}

export function setTempLine(line) { _tempLineObj = line; }
export function setTempLabel(label) { _tempLabelObj = label; }
export function getTempLine() { return _tempLineObj; }
export function getTempLabel() { return _tempLabelObj; }

function updateTempLine(p1, p2) {
  // This is a signal to app.js to update the temp line
  // app.js manages Three.js objects; it checks this after handleClick
}

export function clearTempGraphics() {
  // app.js should remove _tempLineObj and _tempLabelObj from the scene
  _tempLineObj = null;
  _tempLabelObj = null;
}
