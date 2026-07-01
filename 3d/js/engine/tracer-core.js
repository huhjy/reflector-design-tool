// Pure ray tracer: bounces a single ray with specular reflection until it
// reaches an exit surface, escapes the geometry, or fades away.
//
// Hit-finding is injected as an `intersect(origin, direction)` function that
// returns the nearest surface as { point, normal, kind } — kind 'reflect' to
// bounce, 'exit' to leave through the aperture — or null if the ray escapes the
// geometry entirely (a leak in a closed airspace). This keeps the physics
// independent of the geometry backend (see intersector.js and design §3, §8).

import { reflect, dot, add, scale, normalize } from './geom3.js';

// Distance to nudge a reflected ray off the surface so it does not immediately
// re-hit the triangle it just bounced from.
const SURFACE_OFFSET = 1e-6;

const DEFAULTS = {
  reflectivity: 0.85,
  maxBounces: 20,
  minIntensity: 0.005,
  intensity: 1, // Starting intensity (use the ray's emission weight).
};

// Trace one ray. Returns:
//   status     — 'exit' (reached the aperture), 'absorbed' (faded / out of
//                bounces), or 'escaped' (left the geometry through no surface)
//   direction  — the ray's final unit direction
//   intensity  — remaining intensity after reflectivity losses
//   bounces    — number of reflections taken
//   path       — visited points (origin → each hit), for viewport drawing
export function traceRay(origin, direction, intersect, options = {}) {
  const { reflectivity, maxBounces, minIntensity, intensity: startIntensity } = { ...DEFAULTS, ...options };

  let rayOrigin = origin;
  let rayDirection = normalize(direction);
  let intensity = startIntensity;
  let bounces = 0;
  const path = [rayOrigin];

  while (bounces < maxBounces) {
    const hit = intersect(rayOrigin, rayDirection);
    if (!hit) {
      return result('escaped', rayDirection, intensity, bounces, path);
    }

    path.push(hit.point);

    if (hit.kind === 'exit') {
      return result('exit', rayDirection, intensity, bounces, path);
    }

    const normal = normalFacing(hit.normal, rayDirection);
    rayDirection = reflect(rayDirection, normal);
    rayOrigin = add(hit.point, scale(normal, SURFACE_OFFSET));
    intensity *= reflectivity;
    bounces += 1;

    if (intensity < minIntensity) {
      return result('absorbed', rayDirection, intensity, bounces, path);
    }
  }

  return result('absorbed', rayDirection, intensity, bounces, path);
}

function result(status, direction, intensity, bounces, path) {
  return { status, direction, intensity, bounces, path };
}

// Surface normal oriented against the incoming ray, so reflection behaves the
// same regardless of which face the ray approaches.
function normalFacing(normal, direction) {
  const unit = normalize(normal);
  return dot(unit, direction) > 0 ? scale(unit, -1) : unit;
}
