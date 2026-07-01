// Three.js boundary: build the fitted-beam cone and target-direction arrow used
// to compare the actual beam against the goal.

import * as THREE from 'three';

// A translucent cone with its apex at `apex`, opening along `axis` with the
// given half-angle and length. Represents the fitted exit beam.
export function buildBeamCone(apex, axis, halfAngleDeg, length, color) {
  const radius = length * Math.tan((halfAngleDeg * Math.PI) / 180);
  const geometry = new THREE.ConeGeometry(radius, length, 40, 1, true);
  geometry.translate(0, -length / 2, 0); // Move the apex to the origin (opening toward -Y).

  const orientation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(axis.x, axis.y, axis.z).normalize(),
  );

  const material = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.quaternion.copy(orientation);
  mesh.position.set(apex.x, apex.y, apex.z);
  return mesh;
}

// An arrow from `apex` along `direction`, marking the goal beam direction.
export function buildTargetArrow(apex, direction, length, color) {
  const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
  const origin = new THREE.Vector3(apex.x, apex.y, apex.z);
  return new THREE.ArrowHelper(dir, origin, length, color, length * 0.2, length * 0.12);
}
