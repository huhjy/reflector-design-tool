// Ray representation and helpers

export const MAX_BOUNCES = 10;

export function createRay(origin, angleRad, intensity) {
  return {
    origin: { x: origin.x, y: origin.y },
    direction: {
      x: Math.sin(angleRad),
      y: Math.cos(angleRad),
    },
    intensity,
    bounces: 0,
  };
}

export function pointAlongRay(ray, t) {
  return {
    x: ray.origin.x + ray.direction.x * t,
    y: ray.origin.y + ray.direction.y * t,
  };
}

export function normalize(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len < 1e-12) return { x: 0, y: 1 };
  return { x: v.x / len, y: v.y / len };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function length(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(v, s) {
  return { x: v.x * s, y: v.y * s };
}
