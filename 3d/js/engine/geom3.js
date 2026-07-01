// Pure 3D vector math and ray/triangle geometry for the reflector tracer.
//
// This module has no external dependencies and uses plain { x, y, z } values
// rather than Three.js types, so the physics core stays testable in plain Node
// and independent of the rendering boundary (see design §0.3, §0.4).

const EPSILON = 1e-9;

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(v) {
  return Math.sqrt(dot(v, v));
}

export function normalize(v) {
  const len = length(v);
  if (len < EPSILON) return { x: 0, y: 0, z: 0 };
  return scale(v, 1 / len);
}

// Mirror reflection of an incident direction about a surface normal.
// Expects `normal` to be unit length; returns d - 2(d·n)n.
export function reflect(direction, normal) {
  return subtract(direction, scale(normal, 2 * dot(direction, normal)));
}

// Geometric (flat-face) normal of triangle (a, b, c), unit length.
export function triangleNormal(a, b, c) {
  return normalize(cross(subtract(b, a), subtract(c, a)));
}

// Möller–Trumbore ray/triangle intersection. Double-sided, so it hits the
// triangle from either face (reflectors are mirrors).
//
// Returns { t, point } for the nearest forward hit, where t is the distance
// along `direction` (assumed unit length); returns null if the ray misses.
export function rayTriangle(origin, direction, a, b, c) {
  const edge1 = subtract(b, a);
  const edge2 = subtract(c, a);
  const pvec = cross(direction, edge2);
  const determinant = dot(edge1, pvec);

  // Ray runs parallel to the triangle's plane.
  if (Math.abs(determinant) < EPSILON) return null;

  const inverseDeterminant = 1 / determinant;

  const tvec = subtract(origin, a);
  const u = dot(tvec, pvec) * inverseDeterminant;
  if (u < 0 || u > 1) return null;

  const qvec = cross(tvec, edge1);
  const v = dot(direction, qvec) * inverseDeterminant;
  if (v < 0 || u + v > 1) return null;

  const t = dot(edge2, qvec) * inverseDeterminant;
  if (t < EPSILON) return null; // Triangle is behind the ray origin.

  return { t, point: add(origin, scale(direction, t)) };
}
