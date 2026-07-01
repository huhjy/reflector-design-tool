// Pure face selection: given a picked triangle, find the flat face it belongs to
// (all triangles on the same plane, facing the same way) and mark it as the exit
// aperture. Everything else stays a reflector.

import { subtract, dot, cross, length, normalize, add, scale } from './geom3.js';

// Select the coplanar face containing `pickedIndex`. Returns:
//   isExit  — boolean[] aligned with `triangles` (true for the exit face)
//   normal  — the exit plane's unit normal
//   center  — area-weighted centroid of the exit face
//   area    — total exit-face area
export function selectCoplanarFace(triangles, pickedIndex, options = {}) {
  const angleToleranceDeg = options.angleToleranceDeg ?? 8;
  const distanceTolerance = options.distanceTolerance ?? 0.25;

  const picked = triangles[pickedIndex];
  const normal = faceNormal(picked);
  const planeOffset = dot(normal, picked.a);
  const minCos = Math.cos((angleToleranceDeg * Math.PI) / 180);

  const isExit = new Array(triangles.length).fill(false);
  let area = 0;
  let weightedCenter = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < triangles.length; i++) {
    const triangle = triangles[i];
    if (dot(faceNormal(triangle), normal) < minCos) continue; // Not facing the same way.

    const centroid = faceCentroid(triangle);
    if (Math.abs(dot(normal, centroid) - planeOffset) > distanceTolerance) continue; // Off the plane.

    isExit[i] = true;
    const triangleArea = faceArea(triangle);
    area += triangleArea;
    weightedCenter = add(weightedCenter, scale(centroid, triangleArea));
  }

  const center = area > 0 ? scale(weightedCenter, 1 / area) : faceCentroid(picked);
  return { isExit, normal, center, area };
}

// Build a vertex-position → triangle-indices map so we can walk between
// edge-adjacent triangles. STL is a "soup" (vertices duplicated per triangle),
// so adjacency is found by matching quantized vertex positions.
export function buildVertexAdjacency(triangles) {
  const map = new Map();
  for (let i = 0; i < triangles.length; i++) {
    for (const vertex of [triangles[i].a, triangles[i].b, triangles[i].c]) {
      const key = vertexKey(vertex);
      const list = map.get(key);
      if (list) list.push(i);
      else map.set(key, [i]);
    }
  }
  return map;
}

// Select the connected flat face containing `pickedIndex`: flood-fill from the
// picked triangle to vertex-adjacent triangles whose normal stays within the
// angle tolerance of the picked triangle's normal. Unlike a global plane test,
// this stops at edges/chamfers and never jumps to a disconnected face elsewhere
// on the model. Returns { isExit, normal, center, area }.
export function selectConnectedFace(triangles, adjacency, pickedIndex, options = {}) {
  const angleToleranceDeg = options.angleToleranceDeg ?? 8;
  const minCos = Math.cos((angleToleranceDeg * Math.PI) / 180);
  const referenceNormal = faceNormal(triangles[pickedIndex]);

  const isExit = new Array(triangles.length).fill(false);
  const stack = [pickedIndex];
  isExit[pickedIndex] = true;

  while (stack.length > 0) {
    const current = triangles[stack.pop()];
    for (const vertex of [current.a, current.b, current.c]) {
      const neighbors = adjacency.get(vertexKey(vertex));
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (isExit[neighbor]) continue;
        if (dot(faceNormal(triangles[neighbor]), referenceNormal) >= minCos) {
          isExit[neighbor] = true;
          stack.push(neighbor);
        }
      }
    }
  }

  let area = 0;
  let weightedCenter = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < triangles.length; i++) {
    if (!isExit[i]) continue;
    const triangleArea = faceArea(triangles[i]);
    area += triangleArea;
    weightedCenter = add(weightedCenter, scale(faceCentroid(triangles[i]), triangleArea));
  }
  const center = area > 0 ? scale(weightedCenter, 1 / area) : faceCentroid(triangles[pickedIndex]);
  return { isExit, normal: referenceNormal, center, area };
}

function vertexKey(v) {
  return `${Math.round(v.x * 1000)},${Math.round(v.y * 1000)},${Math.round(v.z * 1000)}`;
}

// Seed index of the largest flat face: group triangles by quantized normal and
// plane offset, sum areas per group, and return a triangle from the biggest
// group. A good default exit face (usually the aperture or a main wall).
export function largestFaceSeedIndex(triangles) {
  const groups = new Map();
  let bestArea = -1;
  let bestIndex = 0;

  for (let i = 0; i < triangles.length; i++) {
    const normal = faceNormal(triangles[i]);
    const offset = dot(normal, triangles[i].a);
    const key = `${round(normal.x)},${round(normal.y)},${round(normal.z)},${Math.round(offset / 0.5)}`;

    const group = groups.get(key) ?? { area: 0, index: i };
    group.area += faceArea(triangles[i]);
    groups.set(key, group);

    if (group.area > bestArea) {
      bestArea = group.area;
      bestIndex = group.index;
    }
  }
  return bestIndex;
}

function round(x) {
  return Math.round(x * 10) / 10;
}

function faceNormal(triangle) {
  return normalize(cross(subtract(triangle.b, triangle.a), subtract(triangle.c, triangle.a)));
}

function faceCentroid(triangle) {
  return scale(add(add(triangle.a, triangle.b), triangle.c), 1 / 3);
}

function faceArea(triangle) {
  return 0.5 * length(cross(subtract(triangle.b, triangle.a), subtract(triangle.c, triangle.a)));
}
