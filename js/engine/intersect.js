// Intersection math for 2D ray tracing
import { dot, normalize, subtract, scale, add } from './ray.js';

const EPSILON = 1e-6;

/**
 * Ray vs line segment intersection.
 * Returns { t, point, normal, param } or null.
 * param is 0..1 along the segment.
 */
export function rayLineSegment(ray, p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const denom = ray.direction.x * dy - ray.direction.y * dx;
  if (Math.abs(denom) < EPSILON) return null;

  const ox = p1.x - ray.origin.x;
  const oy = p1.y - ray.origin.y;

  const t = (ox * dy - oy * dx) / denom;
  if (t < EPSILON) return null;

  const u = (ox * ray.direction.y - oy * ray.direction.x) / denom;
  if (u < -EPSILON || u > 1 + EPSILON) return null;

  const point = {
    x: ray.origin.x + ray.direction.x * t,
    y: ray.origin.y + ray.direction.y * t,
  };

  // Normal: perpendicular to segment, pointing toward ray origin side
  let normal = normalize({ x: -dy, y: dx });
  if (dot(normal, ray.direction) > 0) {
    normal = { x: -normal.x, y: -normal.y };
  }

  return { t, point, normal, param: Math.max(0, Math.min(1, u)) };
}

/**
 * Ray vs parabola: x^2 = 4*f*y in local coords (vertex at origin, opening up).
 * Returns array of { t, point, normal } hits (0-2), in world coords.
 */
export function rayParabola(ray, vertex, focalLength, aperture) {
  // Transform ray to local coordinates (vertex at origin)
  const localOrigin = { x: ray.origin.x - vertex.x, y: ray.origin.y - vertex.y };
  const d = ray.direction;
  const f4 = 4 * focalLength;
  const halfAperture = aperture / 2;

  // Parabola: x^2 = 4f * y
  // Ray: P = O + t*D
  // (Ox + t*Dx)^2 = 4f*(Oy + t*Dy)
  // Dx^2*t^2 + (2*Ox*Dx - 4f*Dy)*t + (Ox^2 - 4f*Oy) = 0

  const a = d.x * d.x;
  const b = 2 * localOrigin.x * d.x - f4 * d.y;
  const c = localOrigin.x * localOrigin.x - f4 * localOrigin.y;

  const hits = [];

  if (Math.abs(a) < EPSILON) {
    // Linear case
    if (Math.abs(b) < EPSILON) return hits;
    const t = -c / b;
    if (t > EPSILON) {
      const lx = localOrigin.x + t * d.x;
      if (Math.abs(lx) <= halfAperture) {
        const point = { x: ray.origin.x + t * d.x, y: ray.origin.y + t * d.y };
        const normal = parabolaNormal(lx, focalLength);
        if (dot(normal, d) > 0) {
          normal.x = -normal.x;
          normal.y = -normal.y;
        }
        hits.push({ t, point, normal });
      }
    }
    return hits;
  }

  const disc = b * b - 4 * a * c;
  if (disc < 0) return hits;

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  for (const t of [t1, t2]) {
    if (t > EPSILON) {
      const lx = localOrigin.x + t * d.x;
      if (Math.abs(lx) <= halfAperture) {
        const point = { x: ray.origin.x + t * d.x, y: ray.origin.y + t * d.y };
        let normal = parabolaNormal(lx, focalLength);
        if (dot(normal, d) > 0) {
          normal = { x: -normal.x, y: -normal.y };
        }
        hits.push({ t, point, normal });
      }
    }
  }

  return hits;
}

function parabolaNormal(localX, focalLength) {
  // Parabola y = x^2 / (4f), tangent = (1, x/(2f)), normal perpendicular
  const slope = localX / (2 * focalLength);
  return normalize({ x: -slope, y: 1 });
}

/**
 * Ray vs ellipse arc.
 * Ellipse: (x/a)^2 + (y/b)^2 = 1 centered at `center`, rotated by `rotation`.
 * Only hits within arcStart..arcEnd (radians, measured from ellipse parametric angle).
 */
export function rayEllipse(ray, center, semiMajor, semiMinor, rotation, arcStart, arcEnd) {
  const cosR = Math.cos(-rotation);
  const sinR = Math.sin(-rotation);

  // Transform ray to ellipse-local frame
  const ox = ray.origin.x - center.x;
  const oy = ray.origin.y - center.y;
  const localOrigin = {
    x: ox * cosR - oy * sinR,
    y: ox * sinR + oy * cosR,
  };
  const localDir = {
    x: ray.direction.x * cosR - ray.direction.y * sinR,
    y: ray.direction.x * sinR + ray.direction.y * cosR,
  };

  // (Ox+t*Dx)^2/a^2 + (Oy+t*Dy)^2/b^2 = 1
  const a2 = semiMajor * semiMajor;
  const b2 = semiMinor * semiMinor;

  const A = (localDir.x * localDir.x) / a2 + (localDir.y * localDir.y) / b2;
  const B = 2 * ((localOrigin.x * localDir.x) / a2 + (localOrigin.y * localDir.y) / b2);
  const C = (localOrigin.x * localOrigin.x) / a2 + (localOrigin.y * localOrigin.y) / b2 - 1;

  const disc = B * B - 4 * A * C;
  if (disc < 0) return [];

  const sqrtDisc = Math.sqrt(disc);
  const hits = [];

  for (const t of [(-B - sqrtDisc) / (2 * A), (-B + sqrtDisc) / (2 * A)]) {
    if (t > EPSILON) {
      const lx = localOrigin.x + t * localDir.x;
      const ly = localOrigin.y + t * localDir.y;

      // Check arc bounds using parametric angle
      let angle = Math.atan2(ly / semiMinor, lx / semiMajor);
      if (angle < 0) angle += 2 * Math.PI;

      let start = arcStart;
      let end = arcEnd;
      // Normalize to 0..2PI
      while (start < 0) start += 2 * Math.PI;
      while (end < 0) end += 2 * Math.PI;

      let inArc;
      if (start <= end) {
        inArc = angle >= start - EPSILON && angle <= end + EPSILON;
      } else {
        inArc = angle >= start - EPSILON || angle <= end + EPSILON;
      }

      if (inArc) {
        // Transform back to world
        const cosR2 = Math.cos(rotation);
        const sinR2 = Math.sin(rotation);
        const point = {
          x: center.x + lx * cosR2 - ly * sinR2,
          y: center.y + lx * sinR2 + ly * cosR2,
        };

        // Normal to ellipse at local point: (x/a^2, y/b^2) in local, then rotate to world
        const localNormal = normalize({ x: lx / a2, y: ly / b2 });
        let normal = {
          x: localNormal.x * cosR2 - localNormal.y * sinR2,
          y: localNormal.x * sinR2 + localNormal.y * cosR2,
        };

        if (dot(normal, ray.direction) > 0) {
          normal = { x: -normal.x, y: -normal.y };
        }

        hits.push({ t, point, normal });
      }
    }
  }

  return hits;
}

/**
 * Ray vs cubic Bezier curve (via line segment subdivision).
 * Returns array of { t, point, normal } hits.
 */
export function rayCubicBezier(ray, p0, p1, p2, p3, subdivisions = 30) {
  const hits = [];
  let prev = p0;

  for (let i = 1; i <= subdivisions; i++) {
    const s = i / subdivisions;
    const curr = cubicBezierPoint(p0, p1, p2, p3, s);
    const hit = rayLineSegment(ray, prev, curr);
    if (hit) {
      // Compute better normal from Bezier tangent at approximate parameter
      const approxS = (i - 0.5) / subdivisions;
      const tangent = cubicBezierTangent(p0, p1, p2, p3, approxS);
      let normal = normalize({ x: -tangent.y, y: tangent.x });
      if (dot(normal, ray.direction) > 0) {
        normal = { x: -normal.x, y: -normal.y };
      }
      hits.push({ t: hit.t, point: hit.point, normal });
    }
    prev = curr;
  }

  return hits;
}

function cubicBezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

function cubicBezierTangent(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

/**
 * Specular reflection: d - 2*(d.n)*n
 */
export function reflectDirection(incoming, normal) {
  const d = dot(incoming, normal);
  return normalize({
    x: incoming.x - 2 * d * normal.x,
    y: incoming.y - 2 * d * normal.y,
  });
}

/**
 * Random diffuse direction in hemisphere defined by normal.
 */
export function diffuseDirection(normal) {
  const angle = (Math.random() - 0.5) * Math.PI;
  const baseAngle = Math.atan2(normal.y, normal.x);
  const newAngle = baseAngle + angle;
  return { x: Math.cos(newAngle), y: Math.sin(newAngle) };
}

// Export helpers for use in reflector-shapes
export { cubicBezierPoint, cubicBezierTangent };
