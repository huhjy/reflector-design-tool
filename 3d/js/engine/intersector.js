// Nearest-hit intersection backend for the tracer.
//
// The tracer (tracer-core.js) takes an `intersect(origin, direction)` function
// so the bounce physics is independent of how hits are found. This module
// provides the brute-force backend used by tests and small meshes; the browser
// supplies a BVH-backed backend for large meshes (design §8).

import { rayTriangle, triangleNormal } from './geom3.js';

// Build an intersector that tests every triangle. `kindOf(index)` classifies a
// triangle as 'reflect' (default) or 'exit'; it lets the caller mark the
// aperture face. Returns the nearest hit as { point, normal, kind }, or null.
export function makeTriangleIntersector(triangles, options = {}) {
  const kindOf = options.kindOf ?? (() => 'reflect');

  return function intersect(origin, direction) {
    let nearestIndex = -1;
    let nearestT = Infinity;
    let nearestPoint = null;

    for (let i = 0; i < triangles.length; i++) {
      const triangle = triangles[i];
      const hit = rayTriangle(origin, direction, triangle.a, triangle.b, triangle.c);
      if (hit && hit.t < nearestT) {
        nearestT = hit.t;
        nearestIndex = i;
        nearestPoint = hit.point;
      }
    }

    if (nearestIndex === -1) return null;

    const triangle = triangles[nearestIndex];
    return {
      point: nearestPoint,
      normal: triangleNormal(triangle.a, triangle.b, triangle.c),
      kind: kindOf(nearestIndex),
    };
  };
}
