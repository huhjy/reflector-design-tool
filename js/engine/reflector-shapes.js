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
      switch (reflector.freeformMode) {
        case 'smooth':
          return computeSmoothPolylinePoints(reflector, count);
        case 'mixed':
          return computeMixedPolylinePoints(reflector, count);
        case 'bezier':
          return sampleFreeform(reflector, count);
        default: // 'polyline' and legacy 'segments'
          return computePolylinePoints(reflector);
      }
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

// ── Smooth (Catmull-Rom spline) helpers ──────────────────────────────────────

function phantomPoint(endpoint, neighbor) {
  return { x: 2 * endpoint.x - neighbor.x, y: 2 * endpoint.y - neighbor.y };
}

/**
 * Convert a Catmull-Rom span [p0,p1,p2,p3] into cubic Bezier control points
 * for the p1→p2 segment.
 */
function catmullRomToBezier(p0, p1, p2, p3) {
  return [
    p1,
    { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
    p2,
  ];
}

/**
 * Get Bezier segment tuples [p0,p1,p2,p3] for the smooth (Catmull-Rom) mode.
 * One tuple per consecutive vertex pair (after applying mirrorX).
 */
export function getSmoothPolylineSegments(reflector) {
  const pts = computePolylinePoints(reflector);
  if (pts.length < 2) return [];
  const segments = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : phantomPoint(pts[0], pts[1]);
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : phantomPoint(pts[pts.length - 1], pts[pts.length - 2]);
    segments.push(catmullRomToBezier(p0, p1, p2, p3));
  }
  return segments;
}

/**
 * Sample points along a smooth Catmull-Rom spline through the freeform vertices.
 */
export function computeSmoothPolylinePoints(reflector, count = 100) {
  const segments = getSmoothPolylineSegments(reflector);
  if (!segments.length) return computePolylinePoints(reflector);
  const points = [];
  const pps = Math.ceil(count / segments.length);
  for (let s = 0; s < segments.length; s++) {
    const [p0, p1, p2, p3] = segments[s];
    for (let j = 0; j <= pps; j++) {
      if (s > 0 && j === 0) continue;
      points.push(cubicBezierPoint(p0, p1, p2, p3, j / pps));
    }
  }
  return points;
}

// ── Mixed (straight + curved) helpers ────────────────────────────────────────

/**
 * Get mixed segments for intersection testing.
 * Each element is { type: 'line'|'bezier', points: [...] }.
 * segmentCurved applies to the left-side vertices; the mirrored right side
 * mirrors the same types in reverse order.
 */
export function getMixedPolylineSegments(reflector) {
  const pts = computePolylinePoints(reflector);
  if (pts.length < 2) return [];

  const origN = (reflector.vertices || []).length;
  const leftSegCount = Math.max(origN - 1, 0);
  const segCurved = reflector.segmentCurved || [];

  // Build full curved[] for every segment in the combined (possibly mirrored) point list
  const allCurved = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (i < leftSegCount) {
      allCurved.push(!!segCurved[i]);
    } else if (i === leftSegCount) {
      // Junction between left and mirrored-right: inherit last left type
      allCurved.push(!!segCurved[leftSegCount - 1]);
    } else {
      // Right mirror: reverse of left (right segment 0 = mirror of last left, etc.)
      const rightIdx = i - leftSegCount - 1;
      const mirrorIdx = leftSegCount - 1 - rightIdx;
      allCurved.push(mirrorIdx >= 0 ? !!segCurved[mirrorIdx] : false);
    }
  }

  const result = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (allCurved[i]) {
      const p0 = i > 0 ? pts[i - 1] : phantomPoint(pts[0], pts[1]);
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i + 2 < pts.length ? pts[i + 2] : phantomPoint(pts[pts.length - 1], pts[pts.length - 2]);
      result.push({ type: 'bezier', points: catmullRomToBezier(p0, p1, p2, p3) });
    } else {
      result.push({ type: 'line', points: [pts[i], pts[i + 1]] });
    }
  }
  return result;
}

/**
 * Sample points for rendering a mixed-mode reflector.
 */
export function computeMixedPolylinePoints(reflector, count = 100) {
  const segs = getMixedPolylineSegments(reflector);
  if (!segs.length) return computePolylinePoints(reflector);
  const curvedCount = segs.filter(s => s.type === 'bezier').length;
  const ppc = Math.ceil(count / Math.max(curvedCount, 1));
  const points = [];
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    if (seg.type === 'bezier') {
      const [p0, p1, p2, p3] = seg.points;
      for (let j = 0; j <= ppc; j++) {
        if (s > 0 && j === 0) continue;
        points.push(cubicBezierPoint(p0, p1, p2, p3, j / ppc));
      }
    } else {
      const [p1, p2] = seg.points;
      if (points.length === 0) points.push({ x: p1.x, y: p1.y });
      points.push({ x: p2.x, y: p2.y });
    }
  }
  return points;
}
