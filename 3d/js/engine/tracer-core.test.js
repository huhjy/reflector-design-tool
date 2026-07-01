import { test } from 'node:test';
import assert from 'node:assert/strict';

import { traceRay } from './tracer-core.js';
import { makeTriangleIntersector } from './intersector.js';
import { normalize, scale } from './geom3.js';

const intersecting = (triangles, options) => makeTriangleIntersector(triangles, options);

function assertClose(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ≈ ${expected}`);
}

function assertVectorClose(actual, expected, tolerance = 1e-6) {
  assertClose(actual.x, expected.x, tolerance);
  assertClose(actual.y, expected.y, tolerance);
  assertClose(actual.z, expected.z, tolerance);
}

// A large floor in the z = 0 plane, normal facing +z.
const floor = [
  { a: { x: -10, y: -10, z: 0 }, b: { x: 10, y: -10, z: 0 }, c: { x: 10, y: 10, z: 0 } },
  { a: { x: -10, y: -10, z: 0 }, b: { x: 10, y: 10, z: 0 }, c: { x: -10, y: 10, z: 0 } },
];

test('a ray reflects off a flat mirror then escapes with the angle of incidence preserved', () => {
  const result = traceRay({ x: 0, y: 0, z: 5 }, { x: 1, y: 0, z: -1 }, intersecting(floor));
  assert.equal(result.status, 'escaped');
  assert.equal(result.bounces, 1);
  assertVectorClose(result.direction, normalize({ x: 1, y: 0, z: 1 }));
});

test('a ray that hits nothing escapes immediately with full intensity', () => {
  const result = traceRay({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 1 }, intersecting(floor));
  assert.equal(result.status, 'escaped');
  assert.equal(result.bounces, 0);
  assert.equal(result.intensity, 1);
});

test('intensity drops by the reflectivity factor on each bounce', () => {
  const result = traceRay({ x: 0, y: 0, z: 5 }, { x: 1, y: 0, z: -1 }, intersecting(floor), { reflectivity: 0.9 });
  assert.equal(result.bounces, 1);
  assertClose(result.intensity, 0.9);
});

test('emission weight sets the starting intensity', () => {
  const result = traceRay({ x: 0, y: 0, z: 5 }, { x: 1, y: 0, z: -1 }, intersecting(floor),
    { reflectivity: 0.5, intensity: 0.8 });
  assertClose(result.intensity, 0.4); // 0.8 × 0.5.
});

test('a ray that reaches an exit face is reported as exited', () => {
  const result = traceRay({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: -1 },
    intersecting(floor, { kindOf: () => 'exit' }));
  assert.equal(result.status, 'exit');
  assert.equal(result.bounces, 0);
  assert.equal(result.intensity, 1); // Exiting does not lose intensity.
});

test('a right-angle corner retroreflects a ray back along its incoming axis', () => {
  const corner = [
    { a: { x: -1, y: -10, z: 0 }, b: { x: 10, y: -10, z: 0 }, c: { x: 10, y: 10, z: 0 } },
    { a: { x: -1, y: -10, z: 0 }, b: { x: 10, y: 10, z: 0 }, c: { x: -1, y: 10, z: 0 } },
    { a: { x: 0, y: -10, z: -1 }, b: { x: 0, y: 10, z: -1 }, c: { x: 0, y: 10, z: 10 } },
    { a: { x: 0, y: -10, z: -1 }, b: { x: 0, y: 10, z: 10 }, c: { x: 0, y: -10, z: 10 } },
  ];
  const incident = normalize({ x: -1, y: 0, z: -1 });

  const result = traceRay({ x: 5, y: 0, z: 4 }, incident, intersecting(corner));

  assert.equal(result.status, 'escaped');
  assert.equal(result.bounces, 2);
  assertVectorClose(result.direction, scale(incident, -1));
});

test('a ray trapped under the bounce budget is absorbed', () => {
  const ceiling = floor.map((t) => ({
    a: { ...t.a, z: 10 }, b: { ...t.b, z: 10 }, c: { ...t.c, z: 10 },
  }));
  const cavity = [...floor, ...ceiling];

  const result = traceRay({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: -1 }, intersecting(cavity), { maxBounces: 3 });

  assert.equal(result.status, 'absorbed');
  assert.equal(result.bounces, 3);
});
