/**
 * acoustic.test.js — Unit tests for SPL coverage calculator
 *
 * Tests verify inverse-square law, dispersion attenuation,
 * coverage boundaries, and known reference values.
 *
 * Speaker at z = 1.2m (ear height) in dedicated distance tests,
 * so 3D distance = horizontal distance (dz = 0).
 * Coverage and orientation tests use ceiling-mounted speakers.
 */

import { calculateSPL, checkCoverage } from './acoustic.js';

/**
 * Speaker at ear height (1.2m) — 3D distance = horizontal distance.
 * 90dB sensitivity, 100W amp.
 */
const EAR_SPEAKER = {
  position: { x: 0, y: 0, z: 1.2 },
  orientation: { h: 0, v: 0 },
  sensitivity: 90,
  maxSPL: 120,
  power: 100,
  dispersionH: 360,
  dispersionV: 360,
};

/**
 * Ceiling-mounted speaker (z=3m) — used for coverage/angle tests.
 */
const CEILING_SPEAKER = {
  position: { x: 0, y: 0, z: 3 },
  orientation: { h: 0, v: 0 },
  sensitivity: 90,
  maxSPL: 120,
  power: 100,
  dispersionH: 90,
  dispersionV: 60,
};

export async function runAcousticTests() {
  let passed = 0;
  let failed = 0;
  const errors = [];

  // --- Test 1: calculateSPL — known reference (1m, 100W, ear height) ---
  // 90dB + 10*log10(100) - 20*log10(1) = 90 + 20 - 0 = 110dB
  const spl1m = calculateSPL(EAR_SPEAKER, { x: 0, y: 1 });
  if (Math.abs(spl1m.spl - 110) > 0.5) {
    failed++;
    errors.push(`calculateSPL: at 1m expected ~110dB, got ${spl1m.spl.toFixed(1)}dB`);
  } else {
    passed++;
  }

  // --- Test 2: calculateSPL — double distance = -6dB ---
  // 110dB at 1m → ~104dB at 2m
  const spl2m = calculateSPL(EAR_SPEAKER, { x: 0, y: 2 });
  if (Math.abs(spl2m.spl - 104) > 1.0) {
    failed++;
    errors.push(`calculateSPL: at 2m expected ~104dB, got ${spl2m.spl.toFixed(1)}dB`);
  } else {
    passed++;
  }

  // --- Test 3: calculateSPL — quad distance = -12dB ---
  // 110dB at 1m → ~98dB at 4m
  const spl4m = calculateSPL(EAR_SPEAKER, { x: 0, y: 4 });
  if (Math.abs(spl4m.spl - 98) > 1.0) {
    failed++;
    errors.push(`calculateSPL: at 4m expected ~98dB, got ${spl4m.spl.toFixed(1)}dB`);
  } else {
    passed++;
  }

  // --- Test 4: calculateSPL — very close distance, capped at maxSPL ---
  const splClose = calculateSPL(EAR_SPEAKER, { x: 0, y: 0.01 });
  if (splClose.spl > EAR_SPEAKER.maxSPL) {
    failed++;
    errors.push(`calculateSPL: close point capped at maxSPL, got ${splClose.spl}`);
  } else {
    passed++;
  }

  // --- Test 5: checkCoverage — point directly in front, ceiling speaker ---
  const inCov = checkCoverage(CEILING_SPEAKER, { x: 0, y: 5 });
  if (!inCov) {
    failed++;
    errors.push('checkCoverage: point directly ahead should be in coverage');
  } else {
    passed++;
  }

  // --- Test 6: checkCoverage — point far to the side (out of coverage) ---
  // Ceiling speaker at (0,0,3), listener at (20,5,1.2)
  // H angle = atan(|20|/5) ≈ 76° > 45° half-angle → out of coverage
  const farCov = checkCoverage(CEILING_SPEAKER, { x: 20, y: 5 });
  if (farCov) {
    failed++;
    errors.push('checkCoverage: far side point should not be in coverage (76° > 45° half-angle)');
  } else {
    passed++;
  }

  // --- Test 7: calculateSPL — dispersion attenuation reduces SPL outside beamwidth ---
  // Compare same horizontal distance, different angles
  const splOnAxis = calculateSPL(CEILING_SPEAKER, { x: 0, y: 3 });
  const splOffAxis = calculateSPL(CEILING_SPEAKER, { x: 6, y: 3 });
  if (splOnAxis.spl <= splOffAxis.spl) {
    failed++;
    errors.push(`calculateSPL: off-axis should be quieter (${splOnAxis.spl.toFixed(1)} vs ${splOffAxis.spl.toFixed(1)})`);
  } else {
    passed++;
  }

  // --- Test 8: calculateSPL — higher power increases SPL by +20dB ---
  const quietSpeaker = { ...EAR_SPEAKER, power: 1 };   // 1W at 1m → 90dB
  const loudSpeaker = { ...EAR_SPEAKER, power: 100 };   // 100W at 1m → 110dB
  const splQuiet = calculateSPL(quietSpeaker, { x: 0, y: 1 });
  const splLoud = calculateSPL(loudSpeaker, { x: 0, y: 1 });
  const diff = splLoud.spl - splQuiet.spl;
  if (Math.abs(diff - 20) > 1) {
    failed++;
    errors.push(`calculateSPL: 1W vs 100W power diff: expected +20dB, got +${diff.toFixed(1)}dB`);
  } else {
    passed++;
  }

  // --- Test 9: calculateSPL — different sensitivity shifts SPL ---
  const highSens = { ...EAR_SPEAKER, sensitivity: 95, power: 1 };
  const lowSens = { ...EAR_SPEAKER, sensitivity: 85, power: 1 };
  const splHigh = calculateSPL(highSens, { x: 0, y: 1 });
  const splLow = calculateSPL(lowSens, { x: 0, y: 1 });
  if (Math.abs((splHigh.spl - splLow.spl) - 10) > 0.5) {
    failed++;
    errors.push(`calculateSPL: 10dB sensitivity diff expected +10dB, got +${(splHigh.spl - splLow.spl).toFixed(1)}dB`);
  } else {
    passed++;
  }

  // --- Test 10: calculateSPL — extremely far point is heavily attenuated ---
  // EAR_SPEAKER is omni (360°), 90dB@1W/1m, 100W amp
  // 90 + 10*log10(100) - 20*log10(10000) = 90 + 20 - 80 = 30dB
  // For a directional speaker (90°H, 60°V), check that attenuation is applied
  const dirSpeaker = { ...EAR_SPEAKER, dispersionH: 90, dispersionV: 60 };
  const splFar = calculateSPL(dirSpeaker, { x: 0, y: 10000 });
  // 30dB free-field but dispersion roll-off at 10km: angleHDeg = 0°, angleVDeg = atan2(1.2, 10000) ≈ 0.007°
  // Both well within half-angles (45°, 30°), so maxRatio < 1, no attenuation
  // Just check it's far below the 110dB at 1m
  if (splFar.spl >= 110) {
    failed++;
    errors.push(`calculateSPL: far point should be well below 110dB, got ${splFar.spl.toFixed(1)}dB`);
  } else {
    passed++;
  }

  // --- Test 11: checkCoverage — vertical dispersion test ---
  // Ceiling speaker at (0,0,3), listener at (0,10,1.2) at ear height
  // dz = 1.8, horiz = 10 → angleV = atan(1.8/10) ≈ 10° < 30° half-angle → in coverage
  const vCov = checkCoverage(CEILING_SPEAKER, { x: 0, y: 10 });
  if (!vCov) {
    failed++;
    errors.push('checkCoverage: point at 10m ahead should be in vertical coverage (10° < 30° half-angle)');
  } else {
    passed++;
  }

  // --- Test 12: calculateSPL — same distance but offset speaker produces same SPL with omni dispersion ---
  const omniSpeaker = { ...EAR_SPEAKER, position: { x: 2, y: 0, z: 1.2 } };
  const splOmni = calculateSPL(omniSpeaker, { x: 0, y: 0 });
  // Distance = 2m from (2,0) to (0,0), 110dB at 1m → 104dB at 2m
  if (Math.abs(splOmni.spl - 104) > 1.0) {
    failed++;
    errors.push(`calculateSPL: 2m offset expected ~104dB, got ${splOmni.spl.toFixed(1)}dB`);
  } else {
    passed++;
  }

  return { passed, failed, errors };
}
