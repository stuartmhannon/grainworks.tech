/**
 * speaker-library.test.js — Unit tests for speaker library parsing
 *
 * Phase 4: Tests for GLL JSON import, preset validation, and preset filtering.
 */

import { parseGLLJson, addImportedPresets, importPresets, importedPresets, getAllPresets, getPresetsByType, BUILTIN_PRESETS } from './speaker-library.js';

export async function runSpeakerLibraryTests() {
  let passed = 0, failed = 0, errors = [];

  // Reset imported presets before tests
  // (We need to clear the module-level state — using splice since import is read-only-ish)
  importedPresets.splice(0, importedPresets.length);

  // === Test 1: Valid GLL JSON parsing ===
  const validJson = JSON.stringify({
    format: 'grainworks-gll-v1',
    speakers: [
      {
        manufacturer: 'JBL',
        model: 'Control 24C',
        type: 'ceiling',
        sensitivity: 89,
        maxSPL: 112,
        power: 40,
        dispersionH: 110,
        dispersionV: 110,
        frequencyRange: { min: 70, max: 20000 },
        coverageAngle: 110,
      },
      {
        manufacturer: 'Bose',
        model: 'FreeSpace DS16',
        type: 'wall',
        sensitivity: 88,
        maxSPL: 106,
        power: 32,
        dispersionH: 125,
        dispersionV: 125,
        coverageAngle: 125,
      },
    ],
  });

  const result1 = parseGLLJson(validJson);
  if (result1.presets.length === 2 && result1.errors.length === 0) {
    passed++;
  } else {
    failed++;
    errors.push(`Valid GLL JSON: expected 2 presets, 0 errors. Got ${result1.presets.length} presets, ${result1.errors.length} errors.`);
  }

  // === Test 2: Invalid JSON ===
  const result2 = parseGLLJson('not-json-at-all');
  if (result2.presets.length === 0 && result2.errors.length === 1 && result2.errors[0].startsWith('Invalid JSON')) {
    passed++;
  } else {
    failed++;
    errors.push(`Invalid JSON: expected 1 error about invalid JSON. Got ${result2.errors.length} errors.`);
  }

  // === Test 3: Empty speakers array ===
  const emptyJson = JSON.stringify({ format: 'grainworks-gll-v1', speakers: [] });
  const result3 = parseGLLJson(emptyJson);
  if (result3.presets.length === 0 && result3.errors.length === 1) {
    passed++;
  } else {
    failed++;
    errors.push(`Empty speakers: expected 1 error, got ${result3.errors.length}.`);
  }

  // === Test 4: Missing required fields ===
  const incompleteJson = JSON.stringify({
    format: 'grainworks-gll-v1',
    speakers: [
      { model: 'No Specs' },
    ],
  });
  const result4 = parseGLLJson(incompleteJson);
  if (result4.presets.length === 0 && result4.errors.length === 1) {
    passed++;
  } else {
    failed++;
    errors.push(`Missing fields: expected 1 skipped preset, got ${result4.presets.length} presets.`);
  }

  // === Test 5: Unknown type defaults to ceiling ===
  const unknownTypeJson = JSON.stringify({
    format: 'grainworks-gll-v1',
    speakers: [
      { manufacturer: 'Test', model: 'Weird', type: 'quantum', sensitivity: 90, power: 50, dispersionH: 90 },
    ],
  });
  const result5 = parseGLLJson(unknownTypeJson);
  if (result5.presets.length === 1 && result5.presets[0].type === 'ceiling' && result5.errors.length === 1) {
    passed++;
  } else {
    failed++;
    errors.push(`Unknown type: expected ceiling fallback + warning, got type=${result5.presets[0]?.type}, errors=${result5.errors.length}.`);
  }

  // === Test 6: Auto-generate maxSPL if not provided ===
  const noMaxSPLJson = JSON.stringify({
    format: 'grainworks-gll-v1',
    speakers: [
      { manufacturer: 'Test', model: 'M1', sensitivity: 90, power: 100, dispersionH: 90 },
    ],
  });
  const result6 = parseGLLJson(noMaxSPLJson);
  if (result6.presets.length === 1) {
    // 90 + 10*log10(100) = 90 + 20 = 110
    const expectedSPL = 90 + 10 * Math.log10(100);
    if (Math.abs(result6.presets[0].maxSPL - expectedSPL) < 0.1) {
      passed++;
    } else {
      failed++;
      errors.push(`Auto maxSPL: expected ~${expectedSPL}, got ${result6.presets[0].maxSPL}.`);
    }
  } else {
    failed++;
    errors.push(`Auto maxSPL: expected 1 preset, got ${result6.presets.length}.`);
  }

  // === Test 7: Built-in presets count ===
  if (BUILTIN_PRESETS.length === 4) {
    passed++;
  } else {
    failed++;
    errors.push(`Built-in presets: expected 4, got ${BUILTIN_PRESETS.length}.`);
  }

  // === Test 8: Preset filtering by type ===
  const ceilPresets = BUILTIN_PRESETS.filter(p => p.type === 'ceiling');
  if (ceilPresets.length === 1 && ceilPresets[0].id === 'ceiling-standard') {
    passed++;
  } else {
    failed++;
    errors.push(`Ceiling presets: expected 1 (ceiling-standard), got ${ceilPresets.length}.`);
  }

  // === Test 9: Imported presets are added to the library ===
  const validResult = parseGLLJson(validJson);
  addImportedPresets(validResult.presets);
  if (importedPresets.length === 2) {
    passed++;
  } else {
    failed++;
    errors.push(`Add imported: expected 2, got ${importedPresets.length}.`);
  }

  // === Test 10: Duplicate import is skipped ===
  addImportedPresets(validResult.presets); // same presets again
  if (importedPresets.length === 2) {
    passed++;
  } else {
    failed++;
    errors.push(`Dedup: expected 2, got ${importedPresets.length}.`);
  }

  // === Test 11: Stable IDs are generated ===
  if (result1.presets[0].id === 'imported-jbl-control-24c') {
    passed++;
  } else {
    failed++;
    errors.push(`ID generation: expected 'imported-jbl-control-24c', got '${result1.presets[0].id}'.`);
  }

  // Cleanup
  importedPresets.splice(0, importedPresets.length);

  return { passed, failed, errors };
}
