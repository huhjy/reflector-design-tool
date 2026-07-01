import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fitBeamCone, angleBetweenDeg, elevationDeg, elevatedDirection, onTargetFraction } from './beam-fit.js';

function assertClose(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ≈ ${expected}`);
}

const exitRay = (direction, intensity = 1) => ({ status: 'exit', direction, intensity });

test('fitBeamCone axis is the flux-weighted mean of exit directions', () => {
  const results = [
    exitRay({ x: 0, y: 0, z: 1 }),
    exitRay({ x: 0, y: 0, z: 1 }),
    { status: 'absorbed', direction: { x: 1, y: 0, z: 0 }, intensity: 1 }, // ignored
  ];
  const cone = fitBeamCone(results);
  assertClose(cone.axis.x, 0);
  assertClose(cone.axis.y, 0);
  assertClose(cone.axis.z, 1);
  assert.equal(cone.exitCount, 2);
});

test('fitBeamCone half-angles enclose the requested flux fractions', () => {
  // Rays at 0°, 10°, 20° from +z, equal weight.
  const results = [
    exitRay({ x: 0, y: 0, z: 1 }),
    exitRay({ x: Math.sin(0.1745), y: 0, z: Math.cos(0.1745) }), // ~10°
    exitRay({ x: Math.sin(0.3491), y: 0, z: Math.cos(0.3491) }), // ~20°
  ];
  const cone = fitBeamCone(results, [0.5, 0.9]);
  // Axis tilts slightly toward the spread, so use loose bounds.
  assert.ok(cone.halfAngles[0] < cone.halfAngles[1], 'half-angle grows with fraction');
  assert.ok(cone.halfAngles[1] <= 25, `90% within ~20-something deg, got ${cone.halfAngles[1]}`);
});

test('fitBeamCone with no exit rays returns zero flux', () => {
  const cone = fitBeamCone([{ status: 'absorbed', direction: { x: 0, y: 0, z: 1 }, intensity: 1 }]);
  assert.equal(cone.flux, 0);
  assert.equal(cone.exitCount, 0);
});

test('angleBetweenDeg measures the angle between directions', () => {
  assertClose(angleBetweenDeg({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), 90);
});

test('elevationDeg is +90 straight up and 0 along horizontal', () => {
  assertClose(elevationDeg({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }), 90);
  assertClose(elevationDeg({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), 0);
});

test('elevatedDirection builds a direction 5° below horizontal', () => {
  const target = elevatedDirection({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, -5);
  assertClose(elevationDeg(target, { x: 0, y: 0, z: 1 }), -5);
  assert.ok(target.x > 0, 'keeps the forward heading');
  assert.ok(target.z < 0, 'points downward');
});

test('onTargetFraction weights flux within the cone', () => {
  const up = { x: 0, y: 0, z: 1 };
  const rays = [
    { direction: up, intensity: 3 },                    // on axis
    { direction: { x: 1, y: 0, z: 1 }, intensity: 1 },  // 45° off
  ];
  // Cone of 10° captures only the on-axis ray: 3 / 4.
  assertClose(onTargetFraction(rays, up, 10), 0.75);
  // Cone of 90° captures both.
  assertClose(onTargetFraction(rays, up, 90), 1);
});
