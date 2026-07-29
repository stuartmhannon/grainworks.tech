/**
 * state.js — Project data model + localStorage persistence
 *
 * Pure data. No DOM, no Three.js. Single source of truth for the current project.
 *
 * A Project has: meta, calibration, floorPlan, zones[], modelLibrary, orphans[]
 * A Zone has: boundaries (polygon), roomHeight, entities[]
 * An Entity has: type, modelKey, position, rotation, aff, aas (optional)
 */

const STORAGE_KEY = 'audio-lighting-sim-projects';

// --- Project lifecycle ---

export function createProject(name = 'Untitled') {
  return {
    meta: { name, created: Date.now() },
    calibration: null,          // { p1, p2, realLengthFeet, pixelsPerFoot }
    floorPlan: null,            // { dataUrl, naturalW, naturalH }
    zones: [],
    modelLibrary: {},           // modelKey -> ModelDef (populated from presets + uploads)
    orphans: [],                // entities not yet assigned to a zone
    _nextId: 1,
  };
}

let _current = createProject();

export function getProject() { return _current; }

export function loadProject(proj) { _current = proj; }

export function resetProject() {
  _current = createProject();
  return _current;
}

// --- ID generation ---

function nextId() {
  return (_current._nextId++).toString(16);
}

// --- Calibration ---

export function setCalibration(p1, p2, realLengthFeet) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  _current.calibration = {
    p1, p2, realLengthFeet,
    pixelsPerFoot: pixelDist / realLengthFeet,
  };
}

export function pixelsToFeet(px) {
  if (!_current.calibration) return px;
  return px / _current.calibration.pixelsPerFoot;
}

export function feetToPixels(ft) {
  if (!_current.calibration) return ft;
  return ft * _current.calibration.pixelsPerFoot;
}

// --- Floor Plan ---

export function setFloorPlan(dataUrl, naturalW, naturalH) {
  _current.floorPlan = { dataUrl, naturalW, naturalH };
}

// --- Model Library ---

export function addModel(key, def) {
  _current.modelLibrary[key] = def;
}

export function getModel(key) {
  return _current.modelLibrary[key];
}

// --- Zones ---

export function addZone(name, boundary, roomHeight = 8) {
  const id = 'z' + nextId();
  const zone = { id, name, boundary, roomHeight, entities: [] };
  _current.zones.push(zone);
  return zone;
}

export function removeZone(zoneId) {
  _current.zones = _current.zones.filter(z => z.id !== zoneId);
}

export function getZone(zoneId) {
  return _current.zones.find(z => z.id === zoneId);
}

export function updateZone(zoneId, patch) {
  const z = getZone(zoneId);
  if (z) Object.assign(z, patch);
}

// --- Entities within a Zone ---

export function addEntity(zoneId, params) {
  const zone = getZone(zoneId);
  if (!zone) return null;
  const id = 'e' + nextId();
  const entity = {
    id,
    type: params.type,           // 'fixture' | 'speaker'
    modelKey: params.modelKey,
    position: { x: params.x, y: params.y },
    rotation: params.rotation || 0,
    aff: params.aff || 8,        // required: Above Finished Floor
    aas: params.aas || null,     // { affSurface, surfaceHeight } or null
  };
  zone.entities.push(entity);
  return entity;
}

export function removeEntity(zoneId, entityId) {
  const zone = getZone(zoneId);
  if (!zone) return;
  zone.entities = zone.entities.filter(e => e.id !== entityId);
}

export function updateEntity(zoneId, entityId, patch) {
  const zone = getZone(zoneId);
  if (!zone) return;
  const ent = zone.entities.find(e => e.id === entityId);
  if (ent) Object.assign(ent, patch);
}

export function moveEntity(zoneId, entityId, x, y) {
  updateEntity(zoneId, entityId, { position: { x, y } });
}

/** Resolve the effective mounting height: AAS takes priority over AFF */
export function getMountHeight(entity) {
  if (entity.aas) {
    return entity.aas.affSurface + entity.aas.surfaceHeight;
  }
  return entity.aff;
}

// --- All entities flat (for heatmap render) ---

export function getAllFixtures() {
  const result = [];
  for (const zone of _current.zones) {
    for (const e of zone.entities) {
      if (e.type === 'fixture') {
        result.push({ entity: e, zoneId: zone.id, zoneName: zone.name });
      }
    }
  }
  return result;
}

export function getAllSpeakers() {
  const result = [];
  for (const zone of _current.zones) {
    for (const e of zone.entities) {
      if (e.type === 'speaker') {
        result.push({ entity: e, zoneId: zone.id, zoneName: zone.name });
      }
    }
  }
  return result;
}

// --- localStorage persistence ---

export function saveProject(name) {
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  data[name] = JSON.parse(JSON.stringify(_current));
  data[name].meta.name = name;
  data[name].meta.saved = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadProjectFromStorage(name) {
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  if (data[name]) {
    _current = data[name];
    return _current;
  }
  return null;
}

export function listSavedProjects() {
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  return Object.entries(data).map(([name, proj]) => ({
    name,
    created: proj.meta?.created,
    saved: proj.meta?.saved,
    zoneCount: proj.zones?.length || 0,
  })).sort((a, b) => (b.saved || 0) - (a.saved || 0));
}

export function deleteProjectFromStorage(name) {
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  delete data[name];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// --- JSON import/export (for machine transfer) ---

export function exportProjectJSON() {
  return JSON.stringify(_current, null, 2);
}

export function importProjectJSON(jsonStr) {
  _current = JSON.parse(jsonStr);
  return _current;
}
