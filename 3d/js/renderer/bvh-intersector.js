// Three.js boundary: expose a BVH mesh as the intersect(origin, direction)
// function the pure tracer expects, converting Three types at the edge.

import * as THREE from 'three';

// The mesh must have a BVH (see buildAirspaceMesh) and identity transform, so
// the returned point and face normal are already in world coordinates.
// `kindOf(faceIndex)` classifies each hit as 'reflect' or 'exit'.
export function makeBvhIntersector(mesh, kindOf = () => 'reflect') {
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true; // three-mesh-bvh fast path: nearest hit only.
  raycaster.near = 1e-4;

  const from = new THREE.Vector3();
  const towards = new THREE.Vector3();

  return function intersect(origin, direction) {
    from.set(origin.x, origin.y, origin.z);
    towards.set(direction.x, direction.y, direction.z).normalize();
    raycaster.set(from, towards);

    const hits = raycaster.intersectObject(mesh, false);
    if (hits.length === 0) return null;

    const { point, face, faceIndex } = hits[0];
    const normal = face ? face.normal : towards;
    return {
      point: { x: point.x, y: point.y, z: point.z },
      normal: { x: normal.x, y: normal.y, z: normal.z },
      kind: kindOf(faceIndex),
    };
  };
}
