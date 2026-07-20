/**
 * lighting.js — IES Photometric Calculator
 *
 * Parses LM-63-2002 IES files and computes illuminance (lux) at
 * arbitrary points on a surface from a fixture.
 *
 * ponytail: Assumes standard IES format (LM-63-2002). TILT=INCLUDE
 * and non-standard fields are not handled. Add when a real IES file
 * fails to parse.
 */

/**
 * Parse an LM-63-2002 IES file string into structured data.
 * @param {string} iesContent — raw IES file text
 * @returns {{ verticalAngles: number[], horizontalAngles: number[],
 *            candelas: number[][], metadata: object }}
 * @throws {Error} on invalid format
 */
export function parseIES(iesContent) {
  const lines = iesContent.trim().split('\n');
  if (!lines[0].trim().startsWith('IESNA')) {
    throw new Error('Not a valid IES file — must start with IESNA');
  }

  // Find the data marker line (TILT=NONE or similar)
  let dataStart = -1;
  let metadata = { tilt: 'NONE' };
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim().toUpperCase();
    if (trimmed.startsWith('TILT=')) {
      metadata.tilt = trimmed.replace('TILT=', '').trim();
    }
    if (trimmed === 'TILT=NONE' || /^TILT=\*/.test(trimmed)) {
      dataStart = i + 1;
      break;
    }
  }
  if (dataStart === -1) throw new Error('Could not find TILT= marker');

  // Next line: lamp count, lumens per lamp, multiplier, vertical angles, horizontal angles
  // units: 1=feet, 2=meters
  const paramLine = lines[dataStart].trim().split(/\s+/).map(Number);
  if (paramLine.length < 8) {
    throw new Error('IES parameter line has too few values');
  }
  const [
    lampCount,
    lumensPerLamp,
    multiplier,
    vAngleCount,
    hAngleCount,
    photometricType,
    unitsType,
    width,    // luminaire dimensions
  ] = paramLine;

  let idx = dataStart + 1;

  // Read vertical angles (vAngleCount values)
  const verticalAngles = [];
  while (verticalAngles.length < vAngleCount) {
    const nums = lines[idx].trim().split(/\s+/).map(Number);
    verticalAngles.push(...nums);
    idx++;
  }

  // Read horizontal angles (hAngleCount values)
  const horizontalAngles = [];
  while (horizontalAngles.length < hAngleCount) {
    const nums = lines[idx].trim().split(/\s+/).map(Number);
    horizontalAngles.push(...nums);
    idx++;
  }

  // Read candela matrix: hAngleCount groups, each with vAngleCount values
  const candelas = [];
  for (let h = 0; h < hAngleCount; h++) {
    const group = [];
    while (group.length < vAngleCount) {
      const nums = lines[idx].trim().split(/\s+/).map(Number);
      group.push(...nums);
      idx++;
    }
    candelas.push(group);
  }

  // Remaining lines are metadata labels
  const labels = lines.slice(idx).map(l => l.trim()).filter(l => l.length > 0);

  return {
    verticalAngles,
    horizontalAngles,
    candelas,
    metadata: {
      ...metadata,
      lampCount,
      lumensPerLamp,
      multiplier,
      photometricType,
      unitsType: unitsType === 2 ? 'meters' : 'feet',
      width,
      labels
    }
  };
}

/**
 * Interpolate candela value at an arbitrary angle from the IES table.
 * Uses bilinear interpolation between the four nearest table entries.
 *
 * @param {{ verticalAngles: number[], horizontalAngles: number[],
 *           candelas: number[][] }} iesData — parsed IES data
 * @param {number} vAngle — vertical angle in degrees
 * @param {number} hAngle — horizontal angle in degrees
 * @returns {number} interpolated candela value
 */
export function interpolateCandela(iesData, vAngle, hAngle) {
  const { verticalAngles, horizontalAngles, candelas } = iesData;

  if (verticalAngles.length === 0 || horizontalAngles.length === 0) {
    return 0;
  }

  // Find surrounding vertical indices
  let vi0 = 0, vi1 = verticalAngles.length - 1;
  for (let i = 0; i < verticalAngles.length - 1; i++) {
    if (vAngle >= verticalAngles[i] && vAngle <= verticalAngles[i + 1]) {
      vi0 = i;
      vi1 = i + 1;
      break;
    }
  }

  // Find surrounding horizontal indices
  let hi0 = 0, hi1 = horizontalAngles.length - 1;
  for (let i = 0; i < horizontalAngles.length - 1; i++) {
    if (hAngle >= horizontalAngles[i] && hAngle <= horizontalAngles[i + 1]) {
      hi0 = i;
      hi1 = i + 1;
      break;
    }
  }

  // Bilinear interpolation
  const v0 = verticalAngles[vi0], v1 = verticalAngles[vi1];
  const h0 = horizontalAngles[hi0], h1 = horizontalAngles[hi1];

  const vFrac = v1 === v0 ? 0 : (vAngle - v0) / (v1 - v0);
  const hFrac = h1 === h0 ? 0 : (hAngle - h0) / (h1 - h0);

  const c00 = candelas[hi0][vi0];
  const c01 = candelas[hi1][vi0];
  const c10 = candelas[hi0][vi1];
  const c11 = candelas[hi1][vi1];

  const row0 = c00 + (c01 - c00) * hFrac;
  const row1 = c10 + (c11 - c10) * hFrac;

  return row0 + (row1 - row0) * vFrac;
}

/**
 * Convert candela to lux at a given distance and incidence angle.
 *
 * lux = cd / distance² * cos(incidenceAngle)
 *
 * @param {number} candela — luminous intensity in cd
 * @param {number} distance — distance from source to surface in meters
 * @param {number} incidenceAngle — angle between light direction and
 *                                   surface normal, in radians
 * @returns {number} illuminance in lux
 */
export function candelaToLux(candela, distance, incidenceAngle) {
  if (distance <= 0) return 0;
  return (candela / (distance * distance)) * Math.cos(incidenceAngle);
}

/**
 * Calculate illuminance at a point on a surface from a fixture.
 *
 * @param {object} fixture — { position: {x, y, z}, orientation: {h, v},
 *                             iesData: parsed IES, height: z of mounting }
 * @param {{ x: number, y: number }} point — target point on floor
 * @param {number} surfaceHeight — height of the measurement surface (z)
 * @returns {number} illuminance in lux
 */
export function calculateIlluminance(fixture, point, surfaceHeight = 0) {
  const dx = point.x - fixture.position.x;
  const dy = point.y - fixture.position.y;
  const dz = fixture.position.z - surfaceHeight;

  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance < 0.001) return 0;

  // Vertical angle from fixture downward (0 = straight down)
  const vAngle = Math.atan2(Math.sqrt(dx * dx + dy * dy), dz) * (180 / Math.PI);

  // Horizontal angle from fixture north (0° = +Y)
  const hAngle = (Math.atan2(dx, -dy) * (180 / Math.PI) + 360) % 360;

  // Incidence angle at the surface (0 = perpendicular)
  const incidenceAngle = Math.abs(Math.atan2(Math.sqrt(dx * dx + dy * dy), dz));

  const cd = interpolateCandela(fixture.iesData, vAngle, hAngle);
  return candelaToLux(cd, distance, incidenceAngle);
}
