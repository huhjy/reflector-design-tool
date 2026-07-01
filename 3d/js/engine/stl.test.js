import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseStl, boundsOf } from './stl.js';

// Build a binary STL in memory whose 80-byte header starts with "solid" — the
// case that fools naive text-prefix detection.
function buildBinaryStl(triangles) {
  const view = new DataView(new ArrayBuffer(84 + triangles.length * 50));
  new Uint8Array(view.buffer).set(new TextEncoder().encode('solid binary-trap'), 0);
  view.setUint32(80, triangles.length, true);

  let offset = 84 + 12; // Skip the per-triangle normal.
  for (const triangle of triangles) {
    for (const vertex of [triangle.a, triangle.b, triangle.c]) {
      view.setFloat32(offset, vertex.x, true);
      view.setFloat32(offset + 4, vertex.y, true);
      view.setFloat32(offset + 8, vertex.z, true);
      offset += 12;
    }
    offset += 2 + 12; // Attribute byte count + next triangle's normal.
  }
  return view.buffer;
}

const sampleTriangle = {
  a: { x: 0, y: 0, z: 0 },
  b: { x: 2, y: 0, z: 0 },
  c: { x: 0, y: 3, z: 0 },
};

test('parseStl reads binary vertices despite a "solid" header', () => {
  const triangles = parseStl(buildBinaryStl([sampleTriangle]));
  assert.equal(triangles.length, 1);
  assert.deepEqual(triangles[0].a, sampleTriangle.a);
  assert.deepEqual(triangles[0].b, sampleTriangle.b);
  assert.deepEqual(triangles[0].c, sampleTriangle.c);
});

test('parseStl reads an ASCII STL facet', () => {
  const ascii = [
    'solid tiny',
    'facet normal 0 0 1',
    ' outer loop',
    '  vertex 0 0 0',
    '  vertex 2 0 0',
    '  vertex 0 3 0',
    ' endloop',
    'endfacet',
    'endsolid tiny',
  ].join('\n');

  const triangles = parseStl(new TextEncoder().encode(ascii));

  assert.equal(triangles.length, 1);
  assert.deepEqual(triangles[0].c, { x: 0, y: 3, z: 0 });
});

test('boundsOf returns min, max, size, and center over all vertices', () => {
  const bounds = boundsOf([sampleTriangle]);
  assert.deepEqual(bounds.min, { x: 0, y: 0, z: 0 });
  assert.deepEqual(bounds.max, { x: 2, y: 3, z: 0 });
  assert.deepEqual(bounds.size, { x: 2, y: 3, z: 0 });
  assert.deepEqual(bounds.center, { x: 1, y: 1.5, z: 0 });
});
