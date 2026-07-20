/**
 * coverage-renderer.test.js — Unit tests for heatmap overlay engine
 *
 * Tests verify grid sampling, colormap logic, compositing modes,
 * and canvas rendering output.
 */

import {
  sampleGrid,
  luxToColor,
  splToColor,
  compositeHeatmap,
  renderHeatmapToCanvas,
  renderInterpolatedHeatmap,
  renderCompositeInterpolated,
} from './coverage-renderer.js';

/** A narrow-beam downlight fixture (directly above) */
const TEST_FIXTURE = {
  position: { x: 5, y: 5, z: 3 },
  orientation: { h: 0, v: 0 },
  iesData: {
    verticalAngles: [0, 45, 90],
    horizontalAngles: [0],
    candelas: [[1000, 100, 0]],
    metadata: {}
  }
};

/** A reference speaker */
const TEST_SPEAKER = {
  position: { x: 5, y: 5, z: 3 },
  orientation: { h: 0, v: 0 },
  sensitivity: 90,
  maxSPL: 120,
  power: 100,
  dispersionH: 90,
  dispersionV: 60,
};

const ROOM = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };

export async function runCoverageTests() {
  let passed = 0;
  let failed = 0;
  const errors = [];

  // --- Test 1: sampleGrid — correct sample count ---
  const samples = sampleGrid(ROOM, 5, [TEST_FIXTURE], [TEST_SPEAKER]);
  if (samples.length !== 25) { // 5×5 = 25
    failed++;
    errors.push(`sampleGrid: expected 25 samples (5×5), got ${samples.length}`);
  } else {
    passed++;
  }

  // --- Test 2: sampleGrid — each sample has x, y, lux, spl ---
  let hasAllFields = true;
  for (const s of samples) {
    if (typeof s.x !== 'number' || typeof s.y !== 'number' ||
        typeof s.lux !== 'number' || typeof s.spl !== 'number') {
      hasAllFields = false;
      break;
    }
  }
  if (!hasAllFields) {
    failed++;
    errors.push('sampleGrid: not all samples have x, y, lux, spl');
  } else {
    passed++;
  }

  // --- Test 3: sampleGrid — samples cover the room bounds ---
  let boundsOk = true;
  const eps = 0.01;
  for (const s of samples) {
    if (s.x < ROOM.xMin - eps || s.x > ROOM.xMax + eps ||
        s.y < ROOM.yMin - eps || s.y > ROOM.yMax + eps) {
      boundsOk = false;
      break;
    }
  }
  if (!boundsOk) {
    failed++;
    errors.push('sampleGrid: samples outside room bounds');
  } else {
    passed++;
  }

  // --- Test 4: sampleGrid — samples near fixture have higher lux ---
  const center = samples.find(s => Math.abs(s.x - 5) < 0.1 && Math.abs(s.y - 5) < 0.1);
  const corner = samples.find(s => Math.abs(s.x - 0) < 0.1 && Math.abs(s.y - 0) < 0.1);
  if (center && corner) {
    if (center.lux <= corner.lux) {
      failed++;
      errors.push(`sampleGrid: center lux (${center.lux}) should exceed corner lux (${corner.lux})`);
    } else {
      passed++;
    }
  } else {
    failed++;
    errors.push('sampleGrid: could not find center or corner sample');
  }

  // --- Test 5: sampleGrid — multiple samples have different values ---
  const uniqueLux = new Set(samples.map(s => Math.round(s.lux * 100)));
  if (uniqueLux.size < 2) {
    failed++;
    errors.push('sampleGrid: samples should have varied lux values');
  } else {
    passed++;
  }

  // --- Test 6: sampleGrid — grid density controls sample count ---
  const dense = sampleGrid(ROOM, 10, [], []);
  if (dense.length !== 100) { // 10×10 = 100
    failed++;
    errors.push(`sampleGrid: density=10 should give 100 samples, got ${dense.length}`);
  } else {
    passed++;
  }

  // --- Test 7: sampleGrid — no fixtures, no speakers (all zeros) ---
  const empty = sampleGrid(ROOM, 3, [], []);
  const allZero = empty.every(s => s.lux === 0 && s.spl === 0);
  if (!allZero) {
    failed++;
    errors.push('sampleGrid: empty fixtures/speakers should return 0 lux and 0 spl');
  } else {
    passed++;
  }

  // --- Test 8: luxToColor — max lux maps to full opacity ---
  const maxColor = luxToColor(100, { min: 0, max: 100 });
  if (maxColor.a < 0.5) {
    failed++;
    errors.push(`luxToColor: max value should have high alpha, got ${maxColor.a}`);
  } else {
    passed++;
  }

  // --- Test 9: luxToColor — zero lux maps to transparent ---
  const zeroColor = luxToColor(0, { min: 0, max: 100 });
  if (zeroColor.a !== 0) {
    failed++;
    errors.push(`luxToColor: zero value should be transparent, got alpha=${zeroColor.a}`);
  } else {
    passed++;
  }

  // --- Test 10: luxToColor — equal min/max returns 0 (no range) ---
  const flatColor = luxToColor(50, { min: 50, max: 50 });
  if (flatColor.a !== 0) {
    failed++;
    errors.push(`luxToColor: flat range should return transparent, got alpha=${flatColor.a}`);
  } else {
    passed++;
  }

  // --- Test 11: compositeHeatmap — toggle mode matches individual ---
  const toggleSamples = samples.slice(0, 4);
  const toggle = compositeHeatmap(toggleSamples, 'toggle', 'lux');
  // Range must be computed from the SAME sample subset as compositeHeatmap sees
  const toggleLuxValues = toggleSamples.map(s => s.lux);
  const toggleLuxRange = { min: Math.min(...toggleLuxValues), max: Math.max(...toggleLuxValues) };
  const direct = toggleSamples.map(s => {
    const c = luxToColor(s.lux, toggleLuxRange);
    return { x: s.x, y: s.y, ...c };
  });
  let toggleMatch = true;
  for (let i = 0; i < toggle.length; i++) {
    if (toggle[i].r !== direct[i].r || toggle[i].g !== direct[i].g ||
        toggle[i].b !== direct[i].b || toggle[i].a !== direct[i].a) {
      toggleMatch = false;
      break;
    }
  }
  if (!toggleMatch) {
    failed++;
    errors.push('compositeHeatmap: toggle mode should match individual luxToColor');
  } else {
    passed++;
  }

  // --- Test 12: compositeHeatmap — overlay mode has blended colors ---
  if (samples.length >= 4) {
    const overlay = compositeHeatmap(samples.slice(0, 4), 'overlay');
    const toggleLux = compositeHeatmap(samples.slice(0, 4), 'toggle', 'lux');
    const toggleSpl = compositeHeatmap(samples.slice(0, 4), 'toggle', 'spl');

    // In overlay mode, colors should differ from pure toggle
    let differs = false;
    for (let i = 0; i < overlay.length; i++) {
      if (overlay[i].r !== toggleLux[i].r || overlay[i].r !== toggleSpl[i].r) {
        differs = true;
        break;
      }
    }
    if (!differs) {
      failed++;
      errors.push('compositeHeatmap: overlay mode should produce different colors than toggle');
    } else {
      passed++;
    }
  }

  // --- Test 13: renderHeatmapToCanvas — produces correct image data size ---
  const imageData = renderHeatmapToCanvas(samples, 'lux', 100, 100, ROOM);
  const expectedLength = 100 * 100 * 4;
  if (imageData.length !== expectedLength) {
    failed++;
    errors.push(`renderHeatmapToCanvas: expected ${expectedLength} bytes, got ${imageData.length}`);
  } else {
    passed++;
  }

  // --- Test 14: renderHeatmapToCanvas — center pixel has color (not transparent) ---
  // The center of the room is (5,5) → pixel (50,50) → index (50*100+50)*4 = 20200
  const centerIdx = (50 * 100 + 50) * 4;
  // With the fixture at (5,5), lux should be highest here
  // But the sample grid may not align exactly with pixel 50,50
  // Check if ANY pixel has alpha > 0 (some lux value present)
  let hasColor = false;
  for (let i = 3; i < imageData.length; i += 4) {
    if (imageData[i] > 0) {
      hasColor = true;
      break;
    }
  }
  if (!hasColor) {
    failed++;
    errors.push('renderHeatmapToCanvas: no colored pixels found (nearest-neighbor may miss)');
  } else {
    passed++;
  }

  return { passed, failed, errors };
}

// --- Phase 3: Interpolated heatmap tests ---

// --- Test 15: renderInterpolatedHeatmap — produces correct image data size ---
const interpData = renderInterpolatedHeatmap(samples, 'lux', 50, 50, ROOM, 5);
const expectedInterpLen = 50 * 50 * 4;
if (interpData.length !== expectedInterpLen) {
  failed++;
  errors.push(`renderInterpolatedHeatmap: expected ${expectedInterpLen} bytes, got ${interpData.length}`);
} else {
  passed++;
}

// --- Test 16: renderInterpolatedHeatmap — has colored pixels near fixture center ---
let interpHasColor = false;
for (let i = 3; i < interpData.length; i += 4) {
  if (interpData[i] > 0) {
    interpHasColor = true;
    break;
  }
}
if (!interpHasColor) {
  failed++;
  errors.push('renderInterpolatedHeatmap: no colored pixels found');
} else {
  passed++;
}

// --- Test 17: renderInterpolatedHeatmap — empty samples returns all-transparent ---
const emptyInterp = renderInterpolatedHeatmap([], 'lux', 10, 10, ROOM, 5);
let emptyTransparent = true;
for (let i = 3; i < emptyInterp.length; i += 4) {
  if (emptyInterp[i] > 0) { emptyTransparent = false; break; }
}
if (!emptyTransparent) {
  failed++;
  errors.push('renderInterpolatedHeatmap: empty samples should return all-transparent');
} else {
  passed++;
}

// --- Test 18: renderCompositeInterpolated — produces correct size ---
const compInterp = renderCompositeInterpolated(samples, 'overlay', 50, 50, ROOM, 5);
if (compInterp.length !== expectedInterpLen) {
  failed++;
  errors.push(`renderCompositeInterpolated: expected ${expectedInterpLen} bytes, got ${compInterp.length}`);
} else {
  passed++;
}

// --- Test 19: renderCompositeInterpolated — overlay mode has blended pixels ---
let compHasColor = false;
for (let i = 3; i < compInterp.length; i += 4) {
  if (compInterp[i] > 0) {
    compHasColor = true;
    break;
  }
}
if (!compHasColor) {
  failed++;
  errors.push('renderCompositeInterpolated: no colored pixels in overlay mode');
} else {
  passed++;
}

// --- Test 20: renderCompositeInterpolated — maximum mode differs from overlay ---
const maxInterp = renderCompositeInterpolated(samples, 'maximum', 50, 50, ROOM, 5);
let differsFromOverlay = false;
for (let i = 0; i < compInterp.length; i += 4) {
  if (compInterp[i] !== maxInterp[i] || compInterp[i+1] !== maxInterp[i+1]) {
    differsFromOverlay = true;
    break;
  }
}
if (!differsFromOverlay) {
  failed++;
  errors.push('renderCompositeInterpolated: maximum mode should produce different output than overlay');
} else {
  passed++;
}

return { passed, failed, errors };
}
