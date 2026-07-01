import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dot, cross, length, normalize, reflect, triangleNormal, rayTriangle,
} from './geom3.js';

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ≈ ${expected}`);
}

function assertVectorClose(actual, expected, tolerance = 1e-9) {
  assertClose(actual.x, expected.x, tolerance);
  assertClose(actual.y, expected.y, tolerance);
  assertClose(actual.z, expected.z, tolerance);
}

const xyTriangle = {
  a: { x: -1, y: -1, z: 0 },
  b: { x: 1, y: -1, z: 0 },
  c: { x: 0, y: 1, z: 0 },
};

test('dot multiplies and sums components', () => {
  assert.equal(dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }), 32);
});

test('cross returns a vector perpendicular to both inputs', () => {
  const result = cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  assertVectorClose(result, { x: 0, y: 0, z: 1 });
});

test('normalize returns a unit-length vector in the same direction', () => {
  const result = normalize({ x: 0, y: 3, z: 4 });
  assertClose(length(result), 1);
  assertVectorClose(result, { x: 0, y: 0.6, z: 0.8 });
});

test('reflect mirrors a straight-down ray back up off a flat floor', () => {
  const reflected = reflect({ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 });
  assertVectorClose(reflected, { x: 0, y: 1, z: 0 });
});

test('reflect keeps the tangential component and flips the normal component', () => {
  const incident = normalize({ x: 1, y: -1, z: 0 });
  const reflected = reflect(incident, { x: 0, y: 1, z: 0 });
  assertVectorClose(reflected, normalize({ x: 1, y: 1, z: 0 }));
});

test('triangleNormal points along +z for a counter-clockwise xy triangle', () => {
  const normal = triangleNormal(xyTriangle.a, xyTriangle.b, xyTriangle.c);
  assertVectorClose(normal, { x: 0, y: 0, z: 1 });
});

test('rayTriangle reports the hit point and distance through a triangle', () => {
  const hit = rayTriangle(
    { x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: -1 },
    xyTriangle.a, xyTriangle.b, xyTriangle.c,
  );
  assert.ok(hit, 'expected a hit');
  assertClose(hit.t, 2);
  assertVectorClose(hit.point, { x: 0, y: 0, z: 0 });
});

test('rayTriangle returns null when the ray passes beside the triangle', () => {
  const miss = rayTriangle(
    { x: 5, y: 5, z: 2 }, { x: 0, y: 0, z: -1 },
    xyTriangle.a, xyTriangle.b, xyTriangle.c,
  );
  assert.equal(miss, null);
});

test('rayTriangle returns null when the triangle is behind the ray origin', () => {
  const behind = rayTriangle(
    { x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 1 },
    xyTriangle.a, xyTriangle.b, xyTriangle.c,
  );
  assert.equal(behind, null);
});
