// Pure LED emission model: sample ray directions for a point source emitting a
// cone with a Lambertian intensity profile, aimed along a direction.
//
// A "135° beam" LED emits within ±67.5° of its aim axis, with intensity falling
// off as cos(angle from aim) — matching the emission model the 2D tool used.

import { normalize, cross, add, scale } from './geom3.js';

// Emit `count` rays into a cone of half-angle `halfAngleDeg` around `aim`.
// Directions are spread evenly over the cone's solid angle (Fibonacci spiral);
// each ray carries a Lambertian weight = cos(angle from aim).
// Returns an array of { direction, weight }.
export function coneEmission(aim, halfAngleDeg, count) {
  const axis = normalize(aim);
  const { u, v } = orthonormalBasis(axis);
  const minCos = Math.cos((halfAngleDeg * Math.PI) / 180);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  const rays = new Array(count);
  for (let i = 0; i < count; i++) {
    const cosTheta = 1 - ((i + 0.5) / count) * (1 - minCos);
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const phi = i * goldenAngle;

    const direction = add(
      scale(axis, cosTheta),
      add(scale(u, Math.cos(phi) * sinTheta), scale(v, Math.sin(phi) * sinTheta)),
    );
    rays[i] = { direction: normalize(direction), weight: cosTheta };
  }
  return rays;
}

// Two unit vectors perpendicular to `axis` and to each other.
function orthonormalBasis(axis) {
  const reference = Math.abs(axis.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(reference, axis));
  const v = cross(axis, u);
  return { u, v };
}
