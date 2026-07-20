/**
 * lighting.test.js — Unit tests for IES photometric calculator
 *
 * Tests are pure JS assertions with no framework dependency.
 * Each test function returns { passed, failed, errors }.
 */

import { parseIES, interpolateCandela, candelaToLux, calculateIlluminance } from './lighting.js';

/**
 * A minimal valid IES file string for testing.
 * LM-63-2002 format: 1 lamp, 1000 lumens, multiplier 1,
 * 3 vertical angles (0, 45, 90), 2 horizontal angles (0, 90),
 * 6 candela values (2 groups × 3).
 */
const SAMPLE_IES = `IESNA91
TILT=NONE
1 1000 1 3 2 1 2 1
0 45 90
0 90
100 80 50
90 70 30
[TEST] Sample fixture
`;

/**
 * Sample IES data for fixtures without real IES parsing (parametric tests).
 * Simulates a narrow-beam downlight: 1000cd straight down, falls to 100cd at 45°.
 */
const MOCK_IES_DATA = {
  verticalAngles: [0, 15, 30, 45, 60, 90],
  horizontalAngles: [0, 90, 180, 270],
  candelas: [
    [1000, 800, 500, 200, 50, 0],
    [1000, 800, 500, 200, 50, 0],
    [1000, 800, 500, 200, 50, 0],
    [1000, 800, 500, 200, 50, 0],
  ],
  metadata: {}
};

export async function runLightingTests() {
  let passed = 0;
  let failed = 0;
  const errors = [];

  // --- Test 1: parseIES — valid IES file ---
  try {
    const result = parseIES(SAMPLE_IES);
    if (result.verticalAngles.length !== 3) {
      failed++;
      errors.push(`parseIES: expected 3 vertical angles, got ${result.verticalAngles.length}`);
    } else {
      passed++;
    }
    if (result.horizontalAngles.length !== 2) {
      failed++;
      errors.push(`parseIES: expected 2 horizontal angles, got ${result.horizontalAngles.length}`);
    } else {
      passed++;
    }
    if (result.candelas.length !== 2) {
      failed++;
      errors.push(`parseIES: expected 2 candela groups, got ${result.candelas.length}`);
    } else {
      passed++;
    }
    if (result.candelas[0][0] !== 100) {
      failed++;
      errors.push(`parseIES: expected candelas[0][0]=100, got ${result.candelas[0][0]}`);
    } else {
      passed++;
    }
    if (result.metadata.labels[0] !== '[TEST] Sample fixture') {
      failed++;
      errors.push(`parseIES: expected label '[TEST] Sample fixture', got '${result.metadata.labels[0]}'`);
    } else {
      passed++;
    }
  } catch (e) {
    failed++;
    errors.push(`parseIES threw: ${e.message}`);
  }

  // --- Test 2: parseIES — invalid file throws ---
  try {
    parseIES('NOT AN IES FILE');
    failed++;
    errors.push('parseIES: should have thrown on invalid header');
  } catch (e) {
    passed++;
  }

  // --- Test 3: parseIES — no TILT= marker throws ---
  try {
    parseIES('IESNA91\n1 2 3 4');
    failed++;
    errors.push('parseIES: should have thrown on missing TILT=');
  } catch (e) {
    passed++;
  }

  // --- Test 4: interpolateCandela — exact match at table angles ---
  const exactAngle = interpolateCandela(MOCK_IES_DATA, 0, 0);
  if (Math.abs(exactAngle - 1000) > 0.001) {
    failed++;
    errors.push(`interpolateCandela: at (0,0) expected 1000, got ${exactAngle}`);
  } else {
    passed++;
  }

  // --- Test 5: interpolateCandela — exact match at another table point ---
  const exact45 = interpolateCandela(MOCK_IES_DATA, 45, 90);
  if (Math.abs(exact45 - 200) > 0.001) {
    failed++;
    errors.push(`interpolateCandela: at (45,90) expected 200, got ${exact45}`);
  } else {
    passed++;
  }

  // --- Test 6: interpolateCandela — interpolation returns value between table entries ---
  const midAngle = interpolateCandela(MOCK_IES_DATA, 7.5, 0);
  // At 7.5°, between 0°=1000 and 15°=800 → ~900
  if (midAngle < 800 || midAngle > 1000) {
    failed++;
    errors.push(`interpolateCandela: at (7.5,0) expected ~900, got ${midAngle}`);
  } else {
    passed++;
  }

  // --- Test 7: interpolateCandela — returns 0 for empty data ---
  const empty = interpolateCandela({ verticalAngles: [], horizontalAngles: [], candelas: [] }, 0, 0);
  if (empty !== 0) {
    failed++;
    errors.push(`interpolateCandela: empty data should return 0, got ${empty}`);
  } else {
    passed++;
  }

  // --- Test 8: candelaToLux — inverse square law ---
  // 1000cd at 1m, perpendicular incidence → 1000 lux
  const lux1m = candelaToLux(1000, 1, 0);
  if (Math.abs(lux1m - 1000) > 0.01) {
    failed++;
    errors.push(`candelaToLux: 1000cd at 1m → ${lux1m} lux, expected 1000`);
  } else {
    passed++;
  }

  // --- Test 9: candelaToLux — double distance = quarter lux ---
  const lux2m = candelaToLux(1000, 2, 0);
  if (Math.abs(lux2m - 250) > 0.01) {
    failed++;
    errors.push(`candelaToLux: 1000cd at 2m → ${lux2m} lux, expected 250`);
  } else {
    passed++;
  }

  // --- Test 10: candelaToLux — grazing incidence returns 0 ---
  const luxGrazing = candelaToLux(1000, 1, Math.PI / 2);
  if (Math.abs(luxGrazing) > 0.001) {
    failed++;
    errors.push(`candelaToLux: grazing angle should return ~0, got ${luxGrazing}`);
  } else {
    passed++;
  }

  // --- Test 11: candelaToLux — zero distance returns 0 ---
  const luxZeroDist = candelaToLux(1000, 0, 0);
  if (luxZeroDist !== 0) {
    failed++;
    errors.push(`candelaToLux: zero distance should return 0, got ${luxZeroDist}`);
  } else {
    passed++;
  }

  // --- Test 12: calculateIlluminance — fixture directly above point ---
  const fixture = {
    position: { x: 0, y: 0, z: 3 },
    orientation: { h: 0, v: 0 },
    iesData: MOCK_IES_DATA
  };
  const luxDirect = calculateIlluminance(fixture, { x: 0, y: 0 });
  // Straight down (v=0, h=0) → 1000cd at 3m → 1000/9 = ~111.1 lux
  const expected = 1000 / 9;
  if (Math.abs(luxDirect - expected) > 1) {
    failed++;
    errors.push(`calculateIlluminance: direct below → ${luxDirect} lux, expected ~${expected.toFixed(1)}`);
  } else {
    passed++;
  }

  // --- Test 13: calculateIlluminance — fixture at offset, farther point ---
  const luxOffset = calculateIlluminance(fixture, { x: 3, y: 0 });
  if (luxOffset >= luxDirect) {
    failed++;
    errors.push(`calculateIlluminance: offset point should have less lux than direct, got ${luxOffset} vs ${luxDirect}`);
  } else {
    passed++;
  }

  // --- Test 14: calculateIlluminance — fixture directly at point (zero distance guard) ---
  const fixtureGround = {
    position: { x: 0, y: 0, z: 0 },
    orientation: { h: 0, v: 0 },
    iesData: MOCK_IES_DATA
  };
  const luxCoincident = calculateIlluminance(fixtureGround, { x: 0, y: 0 });
  if (luxCoincident !== 0) {
    failed++;
    errors.push(`calculateIlluminance: coincident should return 0, got ${luxCoincident}`);
  } else {
    passed++;
  }

  return { passed, failed, errors };
}
