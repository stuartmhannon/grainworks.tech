/**
 * palette.js — Fixture/Speaker preset cards + IES/GLL upload → modelLibrary
 *
 * Each palette entry is a ModelDef stored in state.modelLibrary.
 * Presets are loaded on init. User uploads extend the library.
 *
 * ModelDef shape:
 *   { key, name, type: 'fixture'|'speaker', params: {...}, color }
 */

import { addModel, getProject } from './state.js';
import { parseIES } from '../lib/lighting.js';

// --- Built-in presets ---

const BUILTINS = [
  // Fixtures
  { key: 'narrow-downlight',  name: 'Narrow Downlight',   type: 'fixture',  params: { beamAngle: 25,  wattage: 15, lumens: 1100 },  color: '#ffcc44' },
  { key: 'wide-flood',        name: 'Wide Flood',         type: 'fixture',  params: { beamAngle: 60,  wattage: 20, lumens: 1600 },  color: '#ffaa22' },
  { key: 'linear-suspension', name: 'Linear Suspension',  type: 'fixture',  params: { beamAngle: 120, wattage: 40, lumens: 4000 },  color: '#ffdd66' },
  // Speakers
  { key: 'ceiling-speaker',   name: 'Ceiling Speaker',    type: 'speaker',  params: { sensitivity: 88, maxSPL: 110, power: 30, dispersion: 120 }, color: '#44aaff' },
  { key: 'wall-speaker',      name: 'Wall Speaker',       type: 'speaker',  params: { sensitivity: 90, maxSPL: 115, power: 100, dispersion: 90 },  color: '#3388dd' },
  { key: 'subwoofer',         name: 'Subwoofer',          type: 'speaker',  params: { sensitivity: 92, maxSPL: 122, power: 300, dispersion: 360 }, color: '#2266bb' },
];

/** Load built-in presets into modelLibrary */
export function loadBuiltins() {
  for (const m of BUILTINS) {
    addModel(m.key, m);
  }
}

export function getBuiltins() { return BUILTINS; }

// --- IES Upload ---

export function uploadIESFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const iesData = parseIES(content);

        // Extract metadata from IES
        const key = 'ies-' + Date.now().toString(16);
        const name = file.name.replace(/\.ies$/i, '');
        const params = {
          beamAngle: iesData.metadata?.beamAngle || 45,
          wattage: iesData.metadata?.wattage || 10,
          lumens: iesData.metadata?.lumens || 800,
          iesData,  // Store the parsed IES for the simulation engine
        };

        const model = { key, name, type: 'fixture', params, color: '#ffcc44' };
        addModel(key, model);
        resolve(model);
      } catch (err) {
        reject(`Failed to parse IES: ${err.message}`);
      }
    };
    reader.onerror = () => reject('Failed to read file');
    reader.readAsText(file);
  });
}

// --- GLL JSON Upload ---

export function uploadGLLFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const key = 'gll-' + Date.now().toString(16);
        const model = {
          key,
          name: data.model || file.name.replace(/\.(gll\.)?json$/i, ''),
          type: 'speaker',
          params: {
            sensitivity: data.sensitivity || 90,
            maxSPL: data.maxSPL || 115,
            power: data.power || 100,
            dispersion: data.dispersionH || 90,
            frequencyRange: data.frequencyRange || { min: 80, max: 20000 },
          },
          color: '#44aaff',
        };
        addModel(key, model);
        resolve(model);
      } catch (err) {
        reject(`Failed to parse GLL JSON: ${err.message}`);
      }
    };
    reader.onerror = () => reject('Failed to read file');
    reader.readAsText(file);
  });
}

// --- Palette Query ---

export function getAllModels() {
  return Object.values(getProject().modelLibrary);
}

export function getModelsByType(type) {
  return Object.values(getProject().modelLibrary).filter(m => m.type === type);
}
