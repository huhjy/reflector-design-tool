import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeTrace } from './analysis3d.js';

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ≈ ${expected}`);
}

const axis = { x: 0, y: 0, z: 1 };

test('efficiency is exited flux over emitted flux', () => {
  const results = [
    { status: 'exit', emitted: 1, intensity: 0.8, bounces: 2, direction: axis },
    { status: 'absorbed', emitted: 1, intensity: 0.1, bounces: 20, direction: axis },
    { status: 'escaped', emitted: 1, intensity: 1, bounces: 0, direction: axis },
    { status: 'exit', emitted: 1, intensity: 0.6, bounces: 1, direction: axis },
  ];

  const report = analyzeTrace(results, { axis });

  assertClose(report.flux.emitted, 4);
  assertClose(report.flux.exited, 1.4);
  assertClose(report.efficiency, 1.4 / 4);
});

test('outcome counts are tallied by status', () => {
  const results = [
    { status: 'exit', emitted: 1, intensity: 1, bounces: 1, direction: axis },
    { status: 'exit', emitted: 1, intensity: 1, bounces: 3, direction: axis },
    { status: 'absorbed', emitted: 1, intensity: 0, bounces: 20, direction: axis },
    { status: 'escaped', emitted: 1, intensity: 1, bounces: 0, direction: axis },
  ];

  const report = analyzeTrace(results, { axis });

  assert.deepEqual(report.counts, { total: 4, exit: 2, absorbed: 1, escaped: 1 });
  assertClose(report.avgExitBounces, 2); // (1 + 3) / 2.
});

test('exit rays along the axis peak at zero degrees', () => {
  const results = [
    { status: 'exit', emitted: 1, intensity: 1, bounces: 1, direction: { x: 0, y: 0, z: 1 } },
    { status: 'exit', emitted: 1, intensity: 1, bounces: 1, direction: { x: 0, y: 0, z: 1 } },
  ];

  const report = analyzeTrace(results, { axis, binCount: 45, maxAngleDeg: 90 });

  assert.ok(report.angle.peakDeg < 2, `peak ${report.angle.peakDeg}`);
  assertClose(report.angle.meanDeg, 0);
});

test('a 45-degree exit ray is binned near 45 degrees', () => {
  const results = [
    { status: 'exit', emitted: 1, intensity: 1, bounces: 1, direction: { x: 1, y: 0, z: 1 } },
  ];

  const report = analyzeTrace(results, { axis, binCount: 90, maxAngleDeg: 90 });

  assert.ok(Math.abs(report.angle.meanDeg - 45) < 1, `mean ${report.angle.meanDeg}`);
});
