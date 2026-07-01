import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coneEmission } from './light-source.js';
import { normalize, dot } from './geom3.js';

const HALF_ANGLE = 67.5; // A 135° beam.

test('coneEmission returns the requested number of rays', () => {
  assert.equal(coneEmission({ x: 0, y: 0, z: 1 }, HALF_ANGLE, 200).length, 200);
});

test('every ray falls within the beam half-angle of the aim', () => {
  const aim = normalize({ x: 1, y: 2, z: 3 });
  const minCos = Math.cos((HALF_ANGLE * Math.PI) / 180);

  for (const ray of coneEmission(aim, HALF_ANGLE, 300)) {
    assert.ok(dot(ray.direction, aim) >= minCos - 1e-9, 'ray outside the cone');
  }
});

test('directions are unit length', () => {
  for (const ray of coneEmission({ x: 0, y: 0, z: 1 }, HALF_ANGLE, 50)) {
    const magnitude = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z);
    assert.ok(Math.abs(magnitude - 1) <= 1e-9, `magnitude ${magnitude}`);
  }
});

test('Lambertian weight equals cos(angle from aim) and is brightest on-axis', () => {
  const aim = { x: 0, y: 0, z: 1 };
  const rays = coneEmission(aim, HALF_ANGLE, 400);

  for (const ray of rays) {
    assert.ok(Math.abs(ray.weight - dot(ray.direction, aim)) <= 1e-9, 'weight is not cos(angle)');
  }
  // The most on-axis ray carries the most weight.
  const brightest = rays.reduce((a, b) => (a.weight > b.weight ? a : b));
  assert.ok(brightest.weight > Math.cos((HALF_ANGLE * Math.PI) / 180));
});
