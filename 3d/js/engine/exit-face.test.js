import { test } from 'node:test';
import assert from 'node:assert/strict';

import { selectCoplanarFace, largestFaceSeedIndex, buildVertexAdjacency, selectConnectedFace } from './exit-face.js';

// Two triangles forming a unit square on the z = 2 plane (the "exit" face),
// plus one triangle on a different plane that must not be selected.
const triangles = [
  { a: { x: 0, y: 0, z: 2 }, b: { x: 2, y: 0, z: 2 }, c: { x: 2, y: 2, z: 2 } },
  { a: { x: 0, y: 0, z: 2 }, b: { x: 2, y: 2, z: 2 }, c: { x: 0, y: 2, z: 2 } },
  { a: { x: 0, y: 0, z: 0 }, b: { x: 2, y: 0, z: 0 }, c: { x: 2, y: 2, z: 0 } },
];

test('selectCoplanarFace flags all triangles on the picked plane', () => {
  const face = selectCoplanarFace(triangles, 0);
  assert.deepEqual(face.isExit, [true, true, false]);
});

test('selectCoplanarFace reports the face normal', () => {
  const face = selectCoplanarFace(triangles, 0);
  assert.ok(Math.abs(Math.abs(face.normal.z) - 1) <= 1e-9, 'normal should be ±z');
});

test('selectCoplanarFace reports the face center and total area', () => {
  const face = selectCoplanarFace(triangles, 0);
  assert.ok(Math.abs(face.center.x - 1) <= 1e-9);
  assert.ok(Math.abs(face.center.y - 1) <= 1e-9);
  assert.ok(Math.abs(face.center.z - 2) <= 1e-9);
  assert.ok(Math.abs(face.area - 4) <= 1e-9); // 2 × 2 square.
});

test('selectConnectedFace stays on the contiguous face and ignores disconnected coplanar triangles', () => {
  // Two connected triangles share the edge (0,0,2)-(2,2,2) on the z=2 plane.
  // A third is coplanar but far away (disconnected). A fourth is on another plane.
  const mesh = [
    { a: { x: 0, y: 0, z: 2 }, b: { x: 2, y: 0, z: 2 }, c: { x: 2, y: 2, z: 2 } }, // 0
    { a: { x: 0, y: 0, z: 2 }, b: { x: 2, y: 2, z: 2 }, c: { x: 0, y: 2, z: 2 } }, // 1 (shares an edge with 0)
    { a: { x: 50, y: 50, z: 2 }, b: { x: 52, y: 50, z: 2 }, c: { x: 52, y: 52, z: 2 } }, // 2 coplanar but far
    { a: { x: 0, y: 0, z: 0 }, b: { x: 2, y: 0, z: 0 }, c: { x: 2, y: 2, z: 0 } }, // 3 other plane
  ];
  const adjacency = buildVertexAdjacency(mesh);
  const face = selectConnectedFace(mesh, adjacency, 0);
  assert.deepEqual(face.isExit, [true, true, false, false]);
});

test('selectConnectedFace stops at a normal change (chamfer edge)', () => {
  // Two triangles meet along an edge but face different directions.
  const mesh = [
    { a: { x: 0, y: 0, z: 2 }, b: { x: 2, y: 0, z: 2 }, c: { x: 2, y: 2, z: 2 } }, // z-facing
    { a: { x: 0, y: 0, z: 2 }, b: { x: 2, y: 2, z: 2 }, c: { x: 0, y: 0, z: 4 } }, // tilted, shares an edge
  ];
  const adjacency = buildVertexAdjacency(mesh);
  const face = selectConnectedFace(mesh, adjacency, 0);
  assert.deepEqual(face.isExit, [true, false]);
});

test('largestFaceSeedIndex seeds on the biggest flat face', () => {
  // triangles[0] and [1] form the 2×2 exit face (area 4); [2] is a lone
  // triangle on z = 0 (area 2). The seed should land on the big face.
  const seed = largestFaceSeedIndex(triangles);
  const face = selectCoplanarFace(triangles, seed);
  assert.deepEqual(face.isExit, [true, true, false]);
});
