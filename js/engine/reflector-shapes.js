// Converts reflector config into geometry for intersection and rendering
import { cubicBezierPoint } from './intersect.js';

/**
 * Sample points along the reflector surface for rendering.
 */
export function getReflectorSamplePoints(reflector, count = 100) {
  switch (reflector.type) {
    case 'parabolic':
      return sampleParabola(reflector, count);
    case 'elliptical':
      return sampleEllipse(reflector, count);
    case 'freeform':
      if (reflector.freeformMode === 'polyline' || reflector.freeformMode === 'segments') {
        return computePolylinePoints(reflector);
      }
      return sampleFreeform(reflector, count);
    default:
      return [];
  }
}

function sampleParabola(r, count) {
  const points = [];
  const halfAp = r.aperture / 2;
  for (let i = 0; i <= count; i++) {
    const x = -halfAp + (i / count) * r.aperture;
    const y = (x * x) / (4 * r.focalLength);
    points.push({ x: x + r.vertex.x, y: y + r.vertex.y });
  }
  return points;
}

function sampleEllipse(r, count) {
  const points = [];
  const startRad = (r.arcStartDeg * Math.PI) / 180;
  const endRad = (r.arcEndDeg * Math.PI) / 180;
  const cosR = Math.cos(r.rotation);
  const sinR = Math.sin(r.rotation);
  for (let i = 0; i <= count; i++) {
    const angle = startRad + (i / count) * (endRad - startRad);
    const lx = r.semiMajor * Math.cos(angle);
    const ly = r.semiMinor * Math.sin(angle);
    points.push({
      x: r.center.x + lx * cosR - ly * sinR,
      y: r.center.y + lx * sinR + ly * cosR,
    });
  }
  return points;
}

function sampleFreeform(r, count) {
  const pts = r.controlPoints;
  if (pts.length < 4) return [...pts];
  const points = [];
  const numSegments = Math.floor((pts.length - 1) / 3);
  const pointsPerSegment = Math.ceil(count / numSegments);
  for (let seg = 0; seg < numSegments; seg++) {
    const i = seg * 3;
    const p0 = pts[i], p1 = pts[i + 1], p2 = pts[i + 2], p3 = pts[i + 3];
    if (!p0 || !p1 || !p2 || !p3) break;
    for (let j = 0; j <= pointsPerSegment; j++) {
      if (seg > 0 && j === 0) continue;
      const t = j / pointsPerSegment;
      points.push(cubicBezierPoint(p0, p1, p2, p3, t));
    }
  }
  return points;
}

/**
 * Compute polyline points from absolute vertices + optional mirror.
 */
export function computePolylinePoints(reflector) {
  const verts = reflector.vertices;
  if (!verts || verts.length === 0) return [];

  const points = verts.map(v => ({ x: v.x, y: v.y }));

  if (reflector.mirrorX) {
    const mirrored = [];
    for (let i = points.length - 1; i >= 0; i--) {
      mirrored.push({ x: -points[i].x, y: points[i].y });
    }
    const last = points[points.length - 1];
    const firstM = mirrored[0];
    if (Math.abs(last.x + firstM.x) < 0.1 && Math.abs(last.y - firstM.y) < 0.1) {
      points.push(...mirrored.slice(1));
    } else {
      points.push(...mirrored);
    }
  }

  return points;
}

/**
 * Compute derived angle/length between adjacent vertices (for display).
 */
export function computeVertexSegmentInfo(vertices) {
  const result = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const dx = vertices[i + 1].x - vertices[i].x;
    const dy = vertices[i + 1].y - vertices[i].y;
    result.push({
      angleDeg: Math.round(Math.atan2(dy, dx) * 180 / Math.PI * 10) / 10,
      length: Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10,
    });
  }
  return result;
}

/**
 * Get line segment pairs for polyline reflector (for intersection testing).
 */
export function getFreeformSegmentLineSegments(reflector) {
  const points = computePolylinePoints(reflector);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push([points[i], points[i + 1]]);
  }
  return segments;
}

/**
 * Get the Bezier segments for freeform reflector (for intersection testing).
 */
export function getFreeformBezierSegments(reflector) {
  const pts = reflector.controlPoints;
  const segments = [];
  const numSegments = Math.floor((pts.length - 1) / 3);
  for (let seg = 0; seg < numSegments; seg++) {
    const i = seg * 3;
    if (pts[i] && pts[i + 1] && pts[i + 2] && pts[i + 3]) {
      segments.push([pts[i], pts[i + 1], pts[i + 2], pts[i + 3]]);
    }
  }
  return segments;
}
