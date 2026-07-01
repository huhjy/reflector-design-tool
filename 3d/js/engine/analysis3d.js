// Pure analysis of traced rays: how much light exits, where it goes, and how
// hard it worked to get there.
//
// Each input record is one traced ray: { status, intensity, bounces, direction,
// emitted } — `emitted` is the ray's initial emission weight, `intensity` its
// remaining flux at termination.

import { normalize, dot } from './geom3.js';

// Summarize a batch of traced rays relative to a reference axis (the exit-face
// normal), producing flux fractions, ray-outcome counts, and the exit beam's
// angular spread.
export function analyzeTrace(results, options = {}) {
  const axis = normalize(options.axis ?? { x: 0, y: 0, z: 1 });
  const binCount = options.binCount ?? 60;
  // Full 0–180° from the exit normal: 0° is straight out, >90° is light leaving
  // sideways or back through the aperture, which a scattering cavity really does.
  const maxAngleDeg = options.maxAngleDeg ?? 180;
  const binWidth = maxAngleDeg / binCount;

  const flux = { emitted: 0, exited: 0 };
  const counts = { total: results.length, exit: 0, absorbed: 0, escaped: 0 };
  const bins = new Array(binCount).fill(0);
  let exitBounceTotal = 0;
  let angleFluxTotal = 0;
  let weightedAngleTotal = 0;

  for (const ray of results) {
    flux.emitted += ray.emitted;
    counts[ray.status] += 1;

    if (ray.status !== 'exit') continue;

    flux.exited += ray.intensity;
    exitBounceTotal += ray.bounces;

    const angle = angleFromAxisDeg(ray.direction, axis);
    weightedAngleTotal += angle * ray.intensity;
    angleFluxTotal += ray.intensity;

    const index = Math.min(binCount - 1, Math.floor(angle / binWidth));
    if (index >= 0) bins[index] += ray.intensity;
  }

  const binCenters = bins.map((_, i) => (i + 0.5) * binWidth);

  return {
    flux,
    efficiency: flux.emitted > 0 ? flux.exited / flux.emitted : 0,
    counts,
    avgExitBounces: counts.exit > 0 ? exitBounceTotal / counts.exit : 0,
    angle: {
      bins,
      binCenters,
      binWidth,
      peakDeg: peakAngle(bins, binCenters),
      fwhmDeg: fullWidthHalfMax(bins, binWidth),
      meanDeg: angleFluxTotal > 0 ? weightedAngleTotal / angleFluxTotal : 0,
    },
  };
}

function angleFromAxisDeg(direction, axis) {
  const cosAngle = Math.max(-1, Math.min(1, dot(normalize(direction), axis)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

function peakAngle(bins, binCenters) {
  let peakIndex = 0;
  for (let i = 1; i < bins.length; i++) {
    if (bins[i] > bins[peakIndex]) peakIndex = i;
  }
  return binCenters[peakIndex];
}

function fullWidthHalfMax(bins, binWidth) {
  const peak = Math.max(...bins, 0);
  if (peak <= 0) return 0;
  const half = peak / 2;

  let first = -1;
  let last = -1;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] >= half) {
      if (first === -1) first = i;
      last = i;
    }
  }
  return (last - first + 1) * binWidth;
}
