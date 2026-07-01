// Pure STL parser → triangle list in the tracer's { a, b, c } format.
//
// Binary vs ASCII is decided by file size, not by the leading text: a binary
// STL's 80-byte header often starts with "solid", so the text prefix is not a
// reliable signal (the sample fl-4.stl is exactly this case).

const HEADER_BYTES = 80;
const COUNT_BYTES = 4;
const TRIANGLE_BYTES = 50; // 12-byte normal + three 12-byte vertices + 2-byte attribute.
const NORMAL_BYTES = 12;
const VERTEX_BYTES = 12;

// Parse STL bytes (ArrayBuffer, DataView, or typed array) into an array of
// { a, b, c } triangles.
export function parseStl(data) {
  const view = toDataView(data);
  return looksBinary(view) ? parseBinary(view) : parseAscii(decodeText(data));
}

// Axis-aligned bounds of a triangle list, with derived size and center.
// Used to frame the camera and place the light source after import.
export function boundsOf(triangles) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  for (const triangle of triangles) {
    for (const vertex of [triangle.a, triangle.b, triangle.c]) {
      min.x = Math.min(min.x, vertex.x);
      min.y = Math.min(min.y, vertex.y);
      min.z = Math.min(min.z, vertex.z);
      max.x = Math.max(max.x, vertex.x);
      max.y = Math.max(max.y, vertex.y);
      max.z = Math.max(max.z, vertex.z);
    }
  }

  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  return { min, max, size, center };
}

function looksBinary(view) {
  if (view.byteLength < HEADER_BYTES + COUNT_BYTES) return false;
  const triangleCount = view.getUint32(HEADER_BYTES, true);
  return view.byteLength === HEADER_BYTES + COUNT_BYTES + triangleCount * TRIANGLE_BYTES;
}

function parseBinary(view) {
  const triangleCount = view.getUint32(HEADER_BYTES, true);
  const triangles = new Array(triangleCount);
  let offset = HEADER_BYTES + COUNT_BYTES;

  for (let i = 0; i < triangleCount; i++) {
    const vertexBase = offset + NORMAL_BYTES;
    triangles[i] = {
      a: readVertex(view, vertexBase),
      b: readVertex(view, vertexBase + VERTEX_BYTES),
      c: readVertex(view, vertexBase + 2 * VERTEX_BYTES),
    };
    offset += TRIANGLE_BYTES;
  }
  return triangles;
}

function readVertex(view, at) {
  return {
    x: view.getFloat32(at, true),
    y: view.getFloat32(at + 4, true),
    z: view.getFloat32(at + 8, true),
  };
}

function parseAscii(text) {
  const vertexPattern = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
  const vertices = [];
  let match;
  while ((match = vertexPattern.exec(text)) !== null) {
    vertices.push({ x: parseFloat(match[1]), y: parseFloat(match[2]), z: parseFloat(match[3]) });
  }

  const triangles = [];
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    triangles.push({ a: vertices[i], b: vertices[i + 1], c: vertices[i + 2] });
  }
  return triangles;
}

function toDataView(data) {
  if (data instanceof DataView) return data;
  if (data instanceof ArrayBuffer) return new DataView(data);
  if (ArrayBuffer.isView(data)) return new DataView(data.buffer, data.byteOffset, data.byteLength);
  throw new TypeError('parseStl expects an ArrayBuffer, DataView, or typed array');
}

function decodeText(data) {
  const view = toDataView(data);
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return new TextDecoder().decode(bytes);
}
