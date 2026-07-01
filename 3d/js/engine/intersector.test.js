import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeTriangleIntersector } from './intersector.js';

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ≈ ${expected}`);
}

const triangleAt = (z) => ({
  a: { x: -1, y: -1, z },
  b: { x: 1, y: -1, z },
  c: { x: 0, y: 1, z },
});

test('makeTriangleIntersector returns null when the ray hits nothing', () => {
  const intersect = makeTriangleIntersector([triangleAt(0)]);
  assert.equal(intersect({ x: 5, y: 5, z: 2 }, { x: 0, y: 0, z: -1 }), null);
});

test('makeTriangleIntersector returns the nearest of several triangles', () => {
  const intersect = makeTriangleIntersector([triangleAt(0), triangleAt(3), triangleAt(-5)]);
  const hit = intersect({ x: 0, y: 0, z: 6 }, { x: 0, y: 0, z: -1 });
  assert.ok(hit, 'expected a hit');
  assertClose(hit.point.z, 3); // The z = 3 plane is nearest to a ray from z = 6 going -z.
});

test('makeTriangleIntersector reports reflect by default', () => {
  const intersect = makeTriangleIntersector([triangleAt(0)]);
  const hit = intersect({ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: -1 });
  assert.equal(hit.kind, 'reflect');
  assertClose(Math.abs(hit.normal.z), 1);
});

test('makeTriangleIntersector tags the hit using kindOf', () => {
  const intersect = makeTriangleIntersector([triangleAt(0), triangleAt(3)], {
    kindOf: (index) => (index === 1 ? 'exit' : 'reflect'),
  });
  const hit = intersect({ x: 0, y: 0, z: 6 }, { x: 0, y: 0, z: -1 });
  assert.equal(hit.kind, 'exit'); // Nearest is index 1 (z = 3).
});
