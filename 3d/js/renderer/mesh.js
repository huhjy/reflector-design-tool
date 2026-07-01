// Three.js boundary: turn parsed { a, b, c } triangles into renderable meshes.
// The engine/ modules stay pure; everything Three-specific lives here.

import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Route Three's raycasting through the BVH, once for the whole app.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Build the translucent airspace mesh with a BVH. Triangles must already be in
// world (centered) coordinates so the mesh transform stays identity — the
// intersector relies on that. Face order matches the triangle array, so a
// raycast's faceIndex indexes back into it.
export function buildAirspaceMesh(triangles) {
  const geometry = geometryFromTriangles(triangles);
  geometry.computeVertexNormals();
  // indirect: true keeps the triangle order unchanged (the default reorders the
  // geometry for the BVH). We rely on faceIndex matching our triangle array for
  // both face picking and exit-face tagging, so the order must be preserved.
  geometry.computeBoundsTree({ indirect: true });

  const material = new THREE.MeshStandardMaterial({
    color: 0x7fa8d0,
    metalness: 0.1,
    roughness: 0.65,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false, // See the rays inside the translucent shell.
  });

  return new THREE.Mesh(geometry, material);
}

// A bright overlay of a selected face's triangles (exit, source pocket, or the
// hover preview). Rebuilt whenever the selection changes. Pass depthTest:false
// to draw the highlight on top of the translucent shell (used for hover, so the
// face you are about to pick is unmistakable).
export function buildFaceHighlight(triangles, isSelected, color, options = {}) {
  const { opacity = 0.55, depthTest = true, renderOrder = 0 } = options;
  const selected = triangles.filter((_, i) => isSelected[i]);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest,
  });
  const mesh = new THREE.Mesh(geometryFromTriangles(selected), material);
  mesh.renderOrder = renderOrder;
  return mesh;
}

function geometryFromTriangles(triangles) {
  const positions = new Float32Array(triangles.length * 9);
  let i = 0;
  for (const triangle of triangles) {
    for (const vertex of [triangle.a, triangle.b, triangle.c]) {
      positions[i++] = vertex.x;
      positions[i++] = vertex.y;
      positions[i++] = vertex.z;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}
