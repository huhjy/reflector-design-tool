// Pure beam-fitting: characterize the exit beam as a "cone of best fit" and
// compare its pointing direction to a target elevation (e.g. 5° below
// horizontal).

import { normalize, dot, add, subtract, scale, length } from './geom3.js';

// Fit a cone to the exit rays. The axis is the flux-weighted mean direction;
// each half-angle in `fractions` is the smallest cone around the axis that
// contains that fraction of exit flux.
// Returns { axis, flux, exitCount, halfAngles }.
export function fitBeamCone(results, fractions = [0.5, 0.9]) {
  let weightedSum = { x: 0, y: 0, z: 0 };
  let flux = 0;
  const exitRays = [];

  for (const ray of results) {
    if (ray.status !== 'exit') continue;
    weightedSum = add(weightedSum, scale(ray.direction, ray.intensity));
    flux += ray.intensity;
    exitRays.push(ray);
  }

  if (flux === 0) {
    return { axis: { x: 0, y: 0, z: 1 }, flux: 0, exitCount: 0, halfAngles: fractions.map(() => 0) };
  }

  const axis = normalize(weightedSum);
  const sorted = exitRays
    .map((ray) => ({ angle: angleBetweenDeg(ray.direction, axis), weight: ray.intensity }))
    .sort((a, b) => a.angle - b.angle);

  const halfAngles = fractions.map((fraction) => enclosingAngle(sorted, flux, fraction));
  return { axis, flux, exitCount: exitRays.length, halfAngles };
}

function enclosingAngle(sortedByAngle, totalFlux, fraction) {
  const target = totalFlux * fraction;
  let accumulated = 0;
  for (const item of sortedByAngle) {
    accumulated += item.weight;
    if (accumulated >= target) return item.angle;
  }
  return sortedByAngle.length ? sortedByAngle[sortedByAngle.length - 1].angle : 0;
}

// Fraction of output flux traveling within `coneHalfAngleDeg` of `targetDir`.
// This is the score to maximize when aiming the beam at a goal direction.
// `rays` are the output rays as { direction, intensity }.
export function onTargetFraction(rays, targetDir, coneHalfAngleDeg) {
  const target = normalize(targetDir);
  const minCos = Math.cos((coneHalfAngleDeg * Math.PI) / 180);
  let onTarget = 0;
  let total = 0;
  for (const ray of rays) {
    total += ray.intensity;
    if (dot(normalize(ray.direction), target) >= minCos) onTarget += ray.intensity;
  }
  return total > 0 ? onTarget / total : 0;
}

export function angleBetweenDeg(a, b) {
  const cosine = clampUnit(dot(normalize(a), normalize(b)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

// Elevation relative to horizontal (the plane perpendicular to `up`).
// Positive = above horizontal (toward up); negative = below (down).
export function elevationDeg(direction, up) {
  return (Math.asin(clampUnit(dot(normalize(direction), normalize(up)))) * 180) / Math.PI;
}

// A direction at `elevationDegValue` above/below horizontal, keeping the
// horizontal heading of `forward`. Negative elevation points below horizontal.
export function elevatedDirection(forward, up, elevationDegValue) {
  const upUnit = normalize(up);
  let horizontal = subtract(forward, scale(upUnit, dot(forward, upUnit)));
  if (length(horizontal) < 1e-6) horizontal = anyPerpendicular(upUnit);
  horizontal = normalize(horizontal);

  const radians = (elevationDegValue * Math.PI) / 180;
  return normalize(add(scale(horizontal, Math.cos(radians)), scale(upUnit, Math.sin(radians))));
}

function anyPerpendicular(u) {
  const reference = Math.abs(u.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  return subtract(reference, scale(u, dot(reference, u)));
}

function clampUnit(x) {
  return Math.max(-1, Math.min(1, x));
}
