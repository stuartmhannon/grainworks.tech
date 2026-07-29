/**
 * entity.js — Entity placement with AFF/AAS dialog
 *
 * Flow: click palette card → enters PLACE mode → click inside zone →
 *       AFF/AAS dialog → entity created at snapped position
 *
 * AFF is required. AAS is optional (toggle).
 * Mount height: AAS takes priority over AFF when set.
 */

import {
  addEntity, removeEntity, updateEntity, moveEntity,
  getMountHeight, getZone, getAllFixtures, getAllSpeakers,
} from './state.js';
import { findZoneContaining } from './zones.js';

let mode = 'idle';           // 'idle' | 'placing'
let pendingType = null;      // 'fixture' | 'speaker'
let pendingModelKey = null;
let selectedEntityId = null;
let selectedZoneId = null;
let dragState = null;        // { zoneId, entityId, offsetX, offsetY } during drag
let zonesRef = null;         // Reference to project zones array

export function isPlacing() { return mode === 'placing'; }

export function startPlacing(type, modelKey) {
  mode = 'placing';
  pendingType = type;
  pendingModelKey = modelKey;
  selectedEntityId = null;
  return `Click inside a zone to place the ${modelKey}`;
}

export function cancelPlacing() {
  mode = 'idle';
  pendingType = null;
  pendingModelKey = null;
}

export function getPendingType() { return pendingType; }
export function getPendingModelKey() { return pendingModelKey; }
export function getSelectedEntityId() { return selectedEntityId; }
export function getSelectedZoneId() { return selectedZoneId; }

/** Called by app.js when user clicks the floor plan during placing mode.
 *  Returns { zoneId, worldX, worldY } if inside a zone, null otherwise. */
export function handleClick(worldX, worldY, zones) {
  if (mode !== 'placing') return null;

  const zone = findZoneContaining(worldX, worldY, zones);
  if (!zone) return null;  // clicked outside any zone

  // Return the zone + position so app.js can open the AFF dialog
  return {
    zoneId: zone.id,
    zoneName: zone.name,
    x: worldX,
    y: worldY,
  };
}

/** After the user fills in the AFF/AAS dialog */
export function confirmEntity(zoneId, x, y, aff, aas, rotation) {
  const entity = addEntity(zoneId, {
    type: pendingType,
    modelKey: pendingModelKey,
    x, y,
    aff,
    aas: aas || null,
    rotation: rotation || 0,
  });

  // Stay in placing mode for rapid placement
  selectedEntityId = entity.id;
  selectedZoneId = zoneId;
  notifyListeners('entity-placed', { zoneId, entity });

  return entity;
}

// --- Selection ---

export function selectEntity(zoneId, entityId) {
  selectedZoneId = zoneId;
  selectedEntityId = entityId;
  notifyListeners('entity-selected', { zoneId, entityId });
}

export function deselectEntity() {
  selectedEntityId = null;
  selectedZoneId = null;
}

export function getSelectedEntity() {
  if (!selectedZoneId || !selectedEntityId) return null;
  const zone = getZone(selectedZoneId);
  if (!zone) return null;
  return zone.entities.find(e => e.id === selectedEntityId) || null;
}

export function deleteSelectedEntity() {
  if (selectedZoneId && selectedEntityId) {
    removeEntity(selectedZoneId, selectedEntityId);
    const entityId = selectedEntityId;
    selectedEntityId = null;
    selectedZoneId = null;
    notifyListeners('entity-deleted', { zoneId: selectedZoneId, entityId });
  }
}

export function updateSelectedEntity(patch) {
  if (selectedZoneId && selectedEntityId) {
    updateEntity(selectedZoneId, selectedEntityId, patch);
    notifyListeners('entity-updated', { zoneId: selectedZoneId, entityId: selectedEntityId, patch });
  }
}

// --- Drag ---

export function startDrag(zoneId, entityId, worldX, worldY) {
  const zone = getZone(zoneId);
  if (!zone) return;
  const ent = zone.entities.find(e => e.id === entityId);
  if (!ent) return;
  dragState = {
    zoneId, entityId,
    offsetX: worldX - ent.position.x,
    offsetY: worldY - ent.position.y,
  };
  selectedZoneId = zoneId;
  selectedEntityId = entityId;
  notifyListeners('drag-start', { zoneId, entityId });
}

export function continueDrag(worldX, worldY, zones) {
  if (!dragState) return null;
  const newX = worldX - dragState.offsetX;
  const newY = worldY - dragState.offsetY;

  // Check if the new position is still inside the zone
  const zone = findZoneContaining(newX, newY, zones);
  if (!zone || zone.id !== dragState.zoneId) {
    // Out of bounds — clamp to zone boundary or reject
    return { status: 'out-of-bounds', x: newX, y: newY };
  }

  moveEntity(dragState.zoneId, dragState.entityId, newX, newY);
  notifyListeners('drag-move', { zoneId: dragState.zoneId, entityId: dragState.entityId, x: newX, y: newY });
  return { status: 'ok', x: newX, y: newY };
}

export function endDrag() {
  if (dragState) {
    notifyListeners('drag-end', dragState);
  }
  dragState = null;
}

export function isDragging() { return dragState !== null; }

/** Update AFF for the selected entity */
export function setAFF(zoneId, entityId, aff) {
  updateEntity(zoneId, entityId, { aff });
}

/** Set or clear AAS for the selected entity */
export function setAAS(zoneId, entityId, aas) {
  updateEntity(zoneId, entityId, { aas });
}

export function clearAAS(zoneId, entityId) {
  updateEntity(zoneId, entityId, { aas: null });
}

export function setRotation(zoneId, entityId, rotation) {
  updateEntity(zoneId, entityId, { rotation });
}

// --- Listeners ---

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
