/**
 * coverage-renderer.js — Heatmap Overlay Engine
 *
 * Samples a grid of points across a rectangular room and computes
 * combined lighting + audio coverage values. Produces color-mapped
 * overlay data for rendering on a 2D canvas or Three.js surface.
 *
 * ponytail: Assumes rectangular rooms. Non-rectangular rooms
 * (L-shaped, irregular) are Phase 3. Room bounds are a simple
 * { xMin, xMax, yMin, yMax } rect.
 */

import { calculateIlluminance } from './lighting.js';
import { calculateSPL } from './acoustic.js';

/**
 * @typedef {object} RoomBounds
 * @property {number} xMin
 * @property {number} xMax
 * @property {number} yMin
 * @property {number} yMax
 */

/**
 * @typedef {object} GridSample
 * @property {number} x — world x coordinate
 * @property {number} y — world y coordinate
 * @property {number} lux — combined illuminance at this point
 * @property {number} spl — combined SPL at this point
 */

/**
 * Sample a grid of points across a rectangular room.
 *
 * @param {RoomBounds} roomBounds
 * @param {number} gridDensity — samples along each axis (e.g., 20 = 20×20 = 400 samples)
 * @param {object[]} fixtures — array of fixture objects with { iesData, position }
 * @param {object[]} speakers — array of speaker objects
 * @returns {GridSample[]}
 */
export function sampleGrid(roomBounds, gridDensity, fixtures = [], speakers = []) {
  const samples = [];
  const { xMin, xMax, yMin, yMax } = roomBounds;
  const xStep = (xMax - xMin) / (gridDensity - 1);
  const yStep = (yMax - yMin) / (gridDensity - 1);

  for (let yi = 0; yi < gridDensity; yi++) {
    for (let xi = 0; xi < gridDensity; xi++) {
      const x = xMin + xi * xStep;
      const y = yMin + yi * yStep;
      const point = { x, y };

      // Sum illuminance from all fixtures
      let lux = 0;
      for (const fixture of fixtures) {
        lux += calculateIlluminance(fixture, point, 0);
      }

      // Sum SPL from all speakers (power sum: convert dB→W, sum, convert back)
      let totalSPL = 0;
      if (speakers.length > 0) {
        let sumIntensity = 0;
        for (const speaker of speakers) {
          const result = calculateSPL(speaker, point, 1.2);
          // Convert dB SPL to relative intensity (I ∝ 10^(SPL/10))
          sumIntensity += Math.pow(10, result.spl / 10);
        }
        // Convert back to dB
        totalSPL = 10 * Math.log10(sumIntensity);
      }

      samples.push({ x, y, lux, spl: totalSPL });
    }
  }

  return samples;
}

/**
 * Find the range (min, max) of a numeric field in a sample array.
 * @param {GridSample[]} samples
 * @param {'lux'|'spl'} field
 * @returns {{ min: number, max: number }}
 */
function findRange(samples, field) {
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    if (s[field] < min) min = s[field];
    if (s[field] > max) max = s[field];
  }
  return { min, max };
}

/**
 * Convert a normalized [0,1] value to a heatmap color.
 * Uses a 5-stop perceptually-colormap (dark blue → cyan → green → yellow → red).
 * Loosely based on the inferno colormap.
 *
 * @param {number} t — normalized value 0..1
 * @returns {{ r: number, g: number, b: number, a: number }} 0..255 each
 */
function colormap(t) {
  // Clamp
  const v = Math.max(0, Math.min(1, t));

  // 5-stop colormap: [0,0.25,0.5,0.75,1] →
  // dark blue, blue-purple, teal, yellow-green, white-red
  const stops = [
    { t: 0.0, r: 0, g: 0, b: 30 },
    { t: 0.25, r: 0, g: 30, b: 80 },
    { t: 0.5, r: 0, g: 100, b: 80 },
    { t: 0.75, r: 180, g: 180, b: 0 },
    { t: 1.0, r: 220, g: 40, b: 20 },
  ];

  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i].t && v <= stops[i + 1].t) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = upper.t - lower.t;
  const frac = range === 0 ? 0 : (v - lower.t) / range;

  return {
    r: Math.round(lower.r + (upper.r - lower.r) * frac),
    g: Math.round(lower.g + (upper.g - lower.g) * frac),
    b: Math.round(lower.b + (upper.b - lower.b) * frac),
    a: v > 0 ? 0.7 : 0, // transparent at 0
  };
}

/**
 * Convert lux values to heatmap color (0 → transparent, max lux → peak color).
 *
 * @param {number} lux
 * @param {{ min: number, max: number }} range
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function luxToColor(lux, range) {
  const t = range.max > range.min ? (lux - range.min) / (range.max - range.min) : 0;
  return colormap(t);
}

/**
 * Convert SPL values to heatmap color.
 *
 * @param {number} spl
 * @param {{ min: number, max: number }} range
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
export function splToColor(spl, range) {
  const t = range.max > range.min ? (spl - range.min) / (range.max - range.min) : 0;
  return colormap(t);
}

/**
 * Composite lighting + audio heatmaps into one view.
 *
 * @param {GridSample[]} samples
 * @param {'overlay'|'maximum'|'toggle'} mode
 * @param {'lux'|'spl'} activeField — which field to use in 'toggle' mode
 * @returns {Array<{ x: number, y: number, r: number, g: number, b: number, a: number }>}
 */
export function compositeHeatmap(samples, mode = 'overlay', activeField = 'lux') {
  const luxRange = findRange(samples, 'lux');
  const splRange = findRange(samples, 'spl');

  return samples.map(s => {
    const luxColor = luxToColor(s.lux, luxRange);
    const splColor = splToColor(s.spl, splRange);

    switch (mode) {
      case 'toggle':
        if (activeField === 'lux') return { x: s.x, y: s.y, ...luxColor };
        return { x: s.x, y: s.y, ...splColor };

      case 'maximum':
        // Show whichever has higher normalized intensity
        const luxT = luxRange.max > luxRange.min
          ? (s.lux - luxRange.min) / (luxRange.max - luxRange.min) : 0;
        const splT = splRange.max > splRange.min
          ? (s.spl - splRange.min) / (splRange.max - splRange.min) : 0;
        if (luxT >= splT) {
          return { x: s.x, y: s.y, ...luxColor };
        }
        return { x: s.x, y: s.y, ...splColor };

      case 'overlay':
      default:
        // Blend: average color components, take max alpha
        return {
          x: s.x,
          y: s.y,
          r: Math.round((luxColor.r + splColor.r) / 2),
          g: Math.round((luxColor.g + splColor.g) / 2),
          b: Math.round((luxColor.b + splColor.b) / 2),
          a: Math.max(luxColor.a, splColor.a),
        };
    }
  });
}

/**
 * Generate heatmap pixel data for canvas rendering.
 * Returns a flat Uint8ClampedArray (RGBA) that can be loaded
 * directly into an ImageData for canvas.putImageData.
 *
 * @param {GridSample[]} samples — from sampleGrid()
 * @param {'lux'|'spl'} field — which field to render
 * @param {number} width — canvas width in pixels
 * @param {number} height — canvas height in pixels
 * @param {RoomBounds} roomBounds — mapping from grid coords to pixels
 * @returns {Uint8ClampedArray}
 */
export function renderHeatmapToCanvas(samples, field, width, height, roomBounds) {
  const pixRange = findRange(samples, field);
  const colorFn = field === 'lux' ? luxToColor : splToColor;

  const imageData = new Uint8ClampedArray(width * height * 4);
  // Default: transparent
  for (let i = 0; i < imageData.length; i += 4) {
    imageData[i + 3] = 0; // alpha
  }

  const { xMin, xMax, yMin, yMax } = roomBounds;
  const xScale = width / (xMax - xMin);
  const yScale = height / (yMax - yMin);

  for (const sample of samples) {
    const px = Math.round((sample.x - xMin) * xScale);
    const py = Math.round((sample.y - yMin) * yScale);

    if (px < 0 || px >= width || py < 0 || py >= height) continue;

    const color = colorFn(sample[field], pixRange);
    const idx = (py * width + px) * 4;
    imageData[idx] = color.r;
    imageData[idx + 1] = color.g;
    imageData[idx + 2] = color.b;
    imageData[idx + 3] = Math.round(color.a * 255);
  }

  return imageData;
}

/**
 * Render a smooth interpolated heatmap to an image buffer using
 * bilinear interpolation between grid samples.
 *
 * Produces a continuous color field rather than discrete dots,
 * suitable for putImageData onto a canvas.
 *
 * ponytail: Bilinear interpolation assumes rectangular grid spacing.
 * Non-uniform grid layouts would need Delaunay triangulation or
 * inverse-distance weighting instead.
 *
 * @param {GridSample[]} samples — from sampleGrid() (should be N×M grid)
 * @param {'lux'|'spl'} field — which field to render
 * @param {number} width — output canvas width in pixels
 * @param {number} height — output canvas height in pixels
 * @param {RoomBounds} roomBounds — world-space room dimensions
 * @param {number} gridDensity — the N in N×N grid used to generate samples
 * @returns {Uint8ClampedArray} RGBA pixel data, size width×height×4
 */
export function renderInterpolatedHeatmap(samples, field, width, height, roomBounds, gridDensity) {
  const { xMin, xMax, yMin, yMax } = roomBounds;
  const pixRange = findRange(samples, field);
  const colorFn = field === 'lux' ? luxToColor : splToColor;

  const imageData = new Uint8ClampedArray(width * height * 4);
  // Default: transparent
  for (let i = 0; i < imageData.length; i += 4) {
    imageData[i + 3] = 0;
  }

  if (samples.length === 0) return imageData;

  // Build a 2D lookup array from the flat samples list
  const grid = [];
  for (let yi = 0; yi < gridDensity; yi++) {
    const rowStart = yi * gridDensity;
    grid.push(samples.slice(rowStart, rowStart + gridDensity));
  }

  const xStepWorld = (xMax - xMin) / (gridDensity - 1) || 1;
  const yStepWorld = (yMax - yMin) / (gridDensity - 1) || 1;

  // For each output pixel, find its world position and interpolate
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const wx = xMin + (px / width) * (xMax - xMin);
      const wy = yMin + (py / height) * (yMax - yMin);

      // Find grid cell containing this point
      const gi = Math.floor((wx - xMin) / xStepWorld);
      const gj = Math.floor((wy - yMin) / yStepWorld);

      const i0 = Math.max(0, Math.min(gi, gridDensity - 1));
      const j0 = Math.max(0, Math.min(gj, gridDensity - 1));
      const i1 = Math.min(i0 + 1, gridDensity - 1);
      const j1 = Math.min(j0 + 1, gridDensity - 1);

      // Fraction within cell
      const fx = xStepWorld > 0 ? (wx - (xMin + i0 * xStepWorld)) / xStepWorld : 0;
      const fy = yStepWorld > 0 ? (wy - (yMin + j0 * yStepWorld)) / yStepWorld : 0;

      // Bilinear interpolation on the field value
      const v00 = grid[j0][i0][field];
      const v10 = grid[j0][i1][field];
      const v01 = grid[j1][i0][field];
      const v11 = grid[j1][i1][field];

      const top = v00 + (v10 - v00) * fx;
      const bottom = v01 + (v11 - v01) * fx;
      const interpolated = top + (bottom - top) * fy;

      // If the interpolated value is below threshold, leave transparent
      const t = pixRange.max > pixRange.min ? (interpolated - pixRange.min) / (pixRange.max - pixRange.min) : 0;
      if (t <= 0.01) continue;

      const color = colormap(t);
      const idx = (py * width + px) * 4;
      imageData[idx] = color.r;
      imageData[idx + 1] = color.g;
      imageData[idx + 2] = color.b;
      imageData[idx + 3] = Math.round(color.a * 255);
    }
  }

  return imageData;
}

/**
 * Render a composite (overlay/maximum) heatmap with bilinear interpolation.
 *
 * @param {GridSample[]} samples
 * @param {'overlay'|'maximum'} mode
 * @param {number} width — canvas pixel width
 * @param {number} height — canvas pixel height
 * @param {RoomBounds} roomBounds
 * @param {number} gridDensity
 * @returns {Uint8ClampedArray}
 */
export function renderCompositeInterpolated(samples, mode, width, height, roomBounds, gridDensity) {
  const luxBuf = renderInterpolatedHeatmap(samples, 'lux', width, height, roomBounds, gridDensity);
  const splBuf = renderInterpolatedHeatmap(samples, 'spl', width, height, roomBounds, gridDensity);

  const out = new Uint8ClampedArray(luxBuf.length);

  if (mode === 'overlay') {
    // Blend: average RGB, max alpha
    for (let i = 0; i < luxBuf.length; i += 4) {
      out[i] = Math.round((luxBuf[i] + splBuf[i]) / 2);
      out[i + 1] = Math.round((luxBuf[i + 1] + splBuf[i + 1]) / 2);
      out[i + 2] = Math.round((luxBuf[i + 2] + splBuf[i + 2]) / 2);
      out[i + 3] = Math.max(luxBuf[i + 3], splBuf[i + 3]);
    }
  } else {
    // Maximum: show whichever sample has the highest normalized value
    for (let i = 0; i < luxBuf.length; i += 4) {
      if (luxBuf[i + 3] >= splBuf[i + 3]) {
        out[i] = luxBuf[i];
        out[i + 1] = luxBuf[i + 1];
        out[i + 2] = luxBuf[i + 2];
        out[i + 3] = luxBuf[i + 3];
      } else {
        out[i] = splBuf[i];
        out[i + 1] = splBuf[i + 1];
        out[i + 2] = splBuf[i + 2];
        out[i + 3] = splBuf[i + 3];
      }
    }
  }

  return out;
}

/**
 * Compute the composite image data for the overlay mode (legacy nearest-neighbor).
 */
export function renderCompositeToCanvas(samples, mode, width, height, roomBounds) {
  const composite = compositeHeatmap(samples, mode);
  const { xMin, xMax, yMin, yMax } = roomBounds;
  const xScale = width / (xMax - xMin);
  const yScale = height / (yMax - yMin);

  const imageData = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < imageData.length; i += 4) {
    imageData[i + 3] = 0;
  }

  for (const pixel of composite) {
    const px = Math.round((pixel.x - xMin) * xScale);
    const py = Math.round((pixel.y - yMin) * yScale);
    if (px < 0 || px >= width || py < 0 || py >= height) continue;

    const idx = (py * width + px) * 4;
    imageData[idx] = pixel.r;
    imageData[idx + 1] = pixel.g;
    imageData[idx + 2] = pixel.b;
    imageData[idx + 3] = Math.round(pixel.a * 255);
  }

  return imageData;
}
