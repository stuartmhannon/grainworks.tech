/**
 * acoustic.js — SPL Coverage Calculator
 *
 * Computes sound pressure level (dB SPL) at arbitrary points on a
 * floor plan given speaker position, sensitivity, power, and
 * dispersion characteristics.
 *
 * Core formulas (ponytail: simplified model — no room reflections,
 * no reverberation time, no diffraction):
 *
 *   SPL_at_distance = sensitivity + 10*log10(power) - 20*log10(distance)
 *   Coverage: within dispersion angle = full SPL, outside = falloff
 *
 * ponytail: Air absorption above 2kHz is ignored — fine for SPL coverage
 * maps but wrong for critical listening prediction. Add when the
 * prototype needs to model auditorium-grade systems.
 */

/**
 * A speaker fixture definition.
 * @typedef {object} Speaker
 * @property {{ x: number, y: number, z: number }} position — mounting position
 * @property {{ h: number, v: number }} orientation — aim (degrees)
 * @property {number} sensitivity — dB SPL at 1W/1m (e.g., 90)
 * @property {number} maxSPL — maximum SPL the speaker can produce
 * @property {number} power — amplifier wattage driving this speaker
 * @property {number} dispersionH — horizontal -6dB beamwidth (degrees)
 * @property {number} dispersionV — vertical -6dB beamwidth (degrees)
 */

/**
 * Calculate SPL at a listener point from a speaker.
 *
 * Uses simplified inverse-square model with dispersion attenuation.
 *
 * @param {Speaker} speaker
 * @param {{ x: number, y: number }} point — listener position on floor
 * @param {number} listenerHeight — ear height above floor (default 1.2m)
 * @returns {{ spl: number, isInCoverage: boolean }}
 */
export function calculateSPL(speaker, point, listenerHeight = 1.2) {
  const dx = point.x - speaker.position.x;
  const dy = point.y - speaker.position.y;
  const dz = speaker.position.z - listenerHeight;

  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance < 0.01) return { spl: speaker.maxSPL, isInCoverage: true };

  // Free-field SPL: sensitivity + 10*log10(power) - 20*log10(distance)
  const distanceAttenuation = 20 * Math.log10(distance);
  let spl = speaker.sensitivity + 10 * Math.log10(speaker.power) - distanceAttenuation;

  // Apply dispersion attenuation
  const { inCoverage, attenuation } = dispersionAttenuation(
    speaker, dx, dy, dz
  );
  spl -= attenuation;

  // Cap at max SPL
  spl = Math.min(spl, speaker.maxSPL);

  // Floor at 0 dB (inaudible threshold for these purposes)
  spl = Math.max(spl, 0);

  return { spl, isInCoverage: inCoverage || spl > 0 };
}

/**
 * Check whether a point is within the speaker's -6dB coverage pattern.
 *
 * @param {Speaker} speaker
 * @param {{ x: number, y: number }} point — listener position on floor
 * @returns {boolean} true if point is within dispersion angle
 */
export function checkCoverage(speaker, point) {
  const dx = point.x - speaker.position.x;
  const dy = point.y - speaker.position.y;
  const dz = speaker.position.z - 1.2; // assume 1.2m ear height

  const { inCoverage } = dispersionAttenuation(speaker, dx, dy, dz);
  return inCoverage;
}

/**
 * Calculate angular attenuation based on speaker dispersion pattern.
 *
 * Returns { inCoverage: boolean, attenuation: number } where
 * attenuation is 0dB inside the -6dB beamwidth, then rises
 * (attenuation increases = SPL decreases) outside.
 *
 * ponytail: Uses a simplified Gaussian roll-off outside the specified
 * beamwidth. Real speakers have complex off-axis response curves
 * that are measured, not approximated.
 *
 * @param {Speaker} speaker
 * @param {number} dx — x distance from speaker to point
 * @param {number} dy — y distance from speaker to point
 * @param {number} dz — z distance from speaker to point
 * @returns {{ inCoverage: boolean, attenuation: number }}
 */
function dispersionAttenuation(speaker, dx, dy, dz) {
  // Horizontal angle from speaker aim
  // Convention: speaker heading 0° = +Y (north), +90° = +X (east)
  const speakerHeadingRad = (speaker.orientation.h || 0) * (Math.PI / 180);
  const pointAngleRad = Math.atan2(dx, dy);
  let relAngleH = pointAngleRad - speakerHeadingRad;

  // Normalize to [-π, π]
  while (relAngleH > Math.PI) relAngleH -= 2 * Math.PI;
  while (relAngleH < -Math.PI) relAngleH += 2 * Math.PI;

  const angleHDeg = Math.abs(relAngleH) * (180 / Math.PI);

  // Vertical angle (elevation from speaker to listener)
  const horizDist = Math.sqrt(dx * dx + dy * dy);
  const angleVDeg = Math.abs(Math.atan2(Math.abs(dz), horizDist) * (180 / Math.PI));

  const halfH = (speaker.dispersionH || 90) / 2;
  const halfV = (speaker.dispersionV || 90) / 2;

  // -6dB beamwidth is typically defined at half-angle.
  // Inside the beamwidth → 0dB attenuation
  // Outside → exponential roll-off (Gaussian approximation)
  const hRatio = angleHDeg / halfH;
  const vRatio = angleVDeg / halfV;

  // Use the worst axis
  const maxRatio = Math.max(hRatio, vRatio);

  if (maxRatio <= 1.0) {
    // Inside beamwidth: on-axis response
    return { inCoverage: true, attenuation: 0 };
  }

  // Exponential roll-off outside beamwidth: -6dB at boundary, -12dB at 2x, etc.
  // Attenuation = 6 * (maxRatio - 1) — roughly 6dB per beamwidth outside
  const attenuation = 6 * (maxRatio - 1);

  return {
    inCoverage: maxRatio <= 1.0,
    attenuation: Math.min(attenuation, 40) // cap at 40dB attenuation
  };
}

export { dispersionAttenuation };
