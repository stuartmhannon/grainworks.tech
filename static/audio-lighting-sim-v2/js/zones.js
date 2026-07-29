/**
 * zones.js — Zone polygon draw, edit, select, delete
 *
 * State machine:
 *   IDLE → click "Draw Zone" → DRAWING → click vertices, close loop → name prompt → zone created
 *
 * Zone boundary is a closed array of {x,y} in world-space feet.
 * A point-in-polygon test is provided for entity placement hit-testing.
 */

import { addZone, removeZone, getZone, updateZone } from './state.js';

let mode = 'idle';                    // 'idle' | 'drawing'
let currentVertices = [];
let selectedZoneId = null;

export function isDrawing() { return mode === 'drawing'; }
export function getMode() { return mode; }
export function getSelectedZoneId() { return selectedZoneId; }

export function startDrawing() {
  mode = 'drawing';
  currentVertices = [];
  selectedZoneId = null;
  notifyListeners('start-drawing');
  return 'Click to place zone vertices. Click the first vertex or double-click to close the polygon.';
}

export function cancelDrawing() {
  mode = 'idle';
  currentVertices = [];
  notifyListeners('cancel-drawing');
}

/** Called by app.js on floor plan click during drawing mode */
export function handleClick(worldX, worldY) {
  if (mode !== 'drawing') return;

  // Check if user clicked near first vertex (close polygon)
  if (currentVertices.length >= 3) {
    const first = currentVertices[0];
    const dist = Math.sqrt((worldX - first.x) ** 2 + (worldY - first.y) ** 2);
    if (dist < 1.5) {  // within 1.5 ft of first vertex
      return completeZone();
    }
  }

  currentVertices.push({ x: worldX, y: worldY });
  notifyListeners('vertex-added', currentVertices);
}

export function handleDoubleClick(worldX, worldY) {
  if (mode !== 'drawing' || currentVertices.length < 3) return;
  // Double-click closes the polygon at the last drawn vertex
  return completeZone();
}

function completeZone() {
  if (currentVertices.length < 3) return 'Zones need at least 3 vertices';

  mode = 'idle';
  const boundary = [...currentVertices];

  // Return zone data — caller (app.js) prompts for name and roomHeight
  const result = {
    type: 'zone-created',
    boundary,
    vertices: currentVertices,
  };

  currentVertices = [];
  notifyListeners('zone-complete', boundary);
  return result;
}

export function confirmZone(boundary, name, roomHeight) {
  const zone = addZone(name, boundary, roomHeight);
  selectedZoneId = zone.id;
  notifyListeners('zone-added', zone);
  return zone;
}

// --- Selection ---

export function selectZone(zoneId) {
  selectedZoneId = zoneId;
  notifyListeners('zone-selected', zoneId);
}

export function deselectZone() {
  selectedZoneId = null;
  notifyListeners('zone-deselected');
}

export function deleteSelectedZone() {
  if (selectedZoneId) {
    removeZone(selectedZoneId);
    selectedZoneId = null;
    notifyListeners('zone-deleted');
  }
}

export function getCurrentVertices() { return currentVertices; }

// --- Point-in-polygon test (ray casting) ---

export function pointInZone(zoneId, x, y) {
  const zone = getZone(zoneId);
  if (!zone || !zone.boundary || zone.boundary.length < 3) return false;
  return pointInPolygon(x, y, zone.boundary);
}

export function findZoneAtPoint(x, y) {
  // Zones drawn last render on top — search in reverse
  const proj = { zones: [] };  // will be replaced at runtime
  // NOTE: This is replaced at runtime by app.js passing the project
  return null;
}

/** Ray casting algorithm */
export function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > py) !== (yj > py))
        && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Replaces findZoneAtPoint with a working version that has access to state
export function findZoneContaining(x, y, zones) {
  for (let i = zones.length - 1; i >= 0; i--) {
    if (pointInPolygon(x, y, zones[i].boundary)) {
      return zones[i];
    }
  }
  return null;
}

export function getZoneArea(boundary) {
  // Shoelace formula
  let area = 0;
  for (let i = 0; i < boundary.length; i++) {
    const j = (i + 1) % boundary.length;
    area += boundary[i].x * boundary[j].y;
    area -= boundary[j].x * boundary[i].y;
  }
  return Math.abs(area) / 2;
}

// --- Listeners (app.js subscribes) ---

const _listeners = {};

export function on(event, fn) {
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(fn);
}

export function off(event, fn) {
  if (!_listeners[event]) return;
  _listeners[event] = _listeners[event].filter(f => f !== fn);
}

function notifyListeners(event, data) {
  (_listeners[event] || []).forEach(fn => fn(data));
}
