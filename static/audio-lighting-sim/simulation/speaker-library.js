/**
 * speaker-library.js — Speaker Preset Library & GLL Import
 *
 * Phase 4: Provides a JSON-based speaker library format and presets.
 * Users can upload a .gll.json file to import custom speaker models,
 * or use the built-in presets from the fixture palette.
 *
 * The JSON format mirrors GLL concepts (Generic Loudspeaker Library):
 * sensitivity, max SPL, dispersion angles, frequency range, and
 * polar pattern metadata.
 *
 * ponytail: This is a simplified JSON-based preset system, not a
 * full GLL-compliant parser. Real GLL files (.gll) contain XML
 * with complex polar data tables. Full GLL parsing is a future
 * phase if dealer demand requires importing manufacturer GLL files
 * directly.
 */

/**
 * Built-in speaker presets — the default palette options.
 * These can be extended by importing .gll.json files.
 */
export const BUILTIN_PRESETS = [
  {
    id: 'ceiling-standard',
    manufacturer: 'Generic',
    model: 'Ceiling Speaker',
    type: 'ceiling',
    sensitivity: 88,
    maxSPL: 110,
    power: 30,
    dispersionH: 120,
    dispersionV: 120,
    frequencyRange: { min: 80, max: 20000 },
    coverageAngle: 120,
    color: '#44aaff',
  },
  {
    id: 'wall-standard',
    manufacturer: 'Generic',
    model: 'Wall Speaker',
    type: 'wall',
    sensitivity: 90,
    maxSPL: 115,
    power: 100,
    dispersionH: 90,
    dispersionV: 60,
    frequencyRange: { min: 60, max: 22000 },
    coverageAngle: 90,
    color: '#3388dd',
  },
  {
    id: 'subwoofer',
    manufacturer: 'Generic',
    model: 'Subwoofer',
    type: 'sub',
    sensitivity: 92,
    maxSPL: 122,
    power: 300,
    dispersionH: 360,
    dispersionV: 360,
    frequencyRange: { min: 20, max: 200 },
    coverageAngle: 360,
    color: '#aa44ff',
  },
  {
    id: 'line-array-column',
    manufacturer: 'Generic',
    model: 'Line Array Column',
    type: 'wall',
    sensitivity: 94,
    maxSPL: 125,
    power: 200,
    dispersionH: 120,
    dispersionV: 20,
    frequencyRange: { min: 100, max: 20000 },
    coverageAngle: 120,
    color: '#22aaaa',
  },
];

/**
 * Imported presets (loaded from .gll.json files during the session).
 * @type {Array<object>}
 */
export let importedPresets = [];

/**
 * Parse a GLL-compatible JSON file into speaker presets.
 *
 * Expected JSON format:
 * ```json
 * {
 *   "format": "grainworks-gll-v1",
 *   "speakers": [
 *     {
 *       "manufacturer": "Manufacturer Name",
 *       "model": "Model Name",
 *       "type": "ceiling|wall|sub|line",
 *       "sensitivity": 90,
 *       "maxSPL": 115,
 *       "power": 100,
 *       "dispersionH": 90,
 *       "dispersionV": 60,
 *       "frequencyRange": { "min": 60, "max": 22000 },
 *       "coverageAngle": 90
 *     }
 *   ]
 * }
 * ```
 *
 * @param {string} jsonContent — raw JSON string from the uploaded file
 * @returns {{ presets: object[], errors: string[] }} — parsed presets and any errors
 */
export function parseGLLJson(jsonContent) {
  const errors = [];
  const presets = [];

  let data;
  try {
    data = JSON.parse(jsonContent);
  } catch (e) {
    return { presets: [], errors: [`Invalid JSON: ${e.message}`] };
  }

  if (!data || data.format !== 'grainworks-gll-v1') {
    errors.push('Unrecognised format. Expected format: "grainworks-gll-v1".');
    // Try to parse anyway if speakers array exists
  }

  if (!Array.isArray(data.speakers) || data.speakers.length === 0) {
    errors.push('No speakers found in file.');
    return { presets, errors };
  }

  for (let i = 0; i < data.speakers.length; i++) {
    const s = data.speakers[i];

    // Validate required fields
    const missing = [];
    if (s.sensitivity === undefined) missing.push('sensitivity');
    if (s.power === undefined) missing.push('power');
    if (s.dispersionH === undefined && s.coverageAngle === undefined) missing.push('dispersionH or coverageAngle');

    if (missing.length > 0) {
      errors.push(`Speaker ${i} (${s.model || 'unnamed'}): missing ${missing.join(', ')}. Skipped.`);
      continue;
    }

    const type = s.type || 'ceiling';
    const validTypes = ['ceiling', 'wall', 'sub', 'line'];
    if (!validTypes.includes(type)) {
      errors.push(`Speaker ${i} (${s.model}): unknown type "${type}". Using "ceiling".`);
    }

    // Generate a unique ID from manufacturer + model
    const id = `imported-${(s.manufacturer || 'custom').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${(s.model || `speaker-${i}`).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    presets.push({
      id,
      manufacturer: s.manufacturer || 'Custom',
      model: s.model || `Imported Speaker ${i + 1}`,
      type: validTypes.includes(type) ? type : 'ceiling',
      sensitivity: s.sensitivity,
      maxSPL: s.maxSPL || (s.sensitivity + 10 * Math.log10(s.power || 30)),
      power: s.power || 30,
      dispersionH: s.dispersionH || s.coverageAngle || 120,
      dispersionV: s.dispersionV || 120,
      frequencyRange: s.frequencyRange || { min: 80, max: 20000 },
      coverageAngle: s.coverageAngle || s.dispersionH || 120,
      color: s.color || '#44aaff',
    });
  }

  return { presets, errors };
}

/**
 * Add imported presets to the session library.
 * @param {object[]} presets
 */
export function addImportedPresets(presets) {
  for (const p of presets) {
    // Avoid duplicates by id
    if (!importedPresets.find(ex => ex.id === p.id)) {
      importedPresets.push(p);
    }
  }
}

/**
 * Get all available presets (built-in + imported).
 * @returns {object[]}
 */
export function getAllPresets() {
  return [...BUILTIN_PRESETS, ...importedPresets];
}

/**
 * Get presets filtered by type.
 * @param {'ceiling'|'wall'|'sub'|'line'} type
 * @returns {object[]}
 */
export function getPresetsByType(type) {
  return getAllPresets().filter(p => p.type === type);
}
