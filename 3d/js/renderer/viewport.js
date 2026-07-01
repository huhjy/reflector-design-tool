// Three.js boundary: the interactive viewport. Owns the scene, camera,
// trackball controls (free rotation + zoom), a drag gizmo for the light source,
// hover + click face picking, and helpers to (re)draw the mesh, highlights, and
// ray paths.

import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const BACKGROUND = 0xeef1f5;
const SOURCE_COLOR = 0xf59e0b;
const AIM_COLOR = 0xf59e0b;
const RAY_COLORS = { exit: 0x16a34a, absorbed: 0xd97706, escaped: 0x9aa7b8 };
const CLICK_DRAG_TOLERANCE_PX = 5;

export function createViewport(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);

  const controls = new TrackballControls(camera, canvas);
  controls.rotateSpeed = 3.5;   // Free rotation in any direction (no pole lock).
  controls.zoomSpeed = 1.3;
  controls.panSpeed = 0.8;
  controls.staticMoving = false;
  controls.dynamicDampingFactor = 0.12;

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
  keyLight.position.set(1, 1.5, 1);
  scene.add(keyLight);

  const rayGroup = new THREE.Group();
  scene.add(rayGroup);

  const highlights = new Map();
  const state = { mesh: null, sourceMarker: null, aimLine: null, sceneRadius: 1 };

  const transform = new TransformControls(camera, canvas);
  transform.addEventListener('dragging-changed', (event) => { controls.enabled = !event.value; });
  scene.add(transform);

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    controls.handleResize();
  }
  window.addEventListener('resize', resize);

  function frameScene(radius) {
    state.sceneRadius = radius;
    camera.near = radius / 200;
    camera.far = radius * 200;
    camera.position.set(radius * 1.8, radius * 1.4, radius * 2.0);
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.minDistance = radius * 0.15;
    controls.maxDistance = radius * 40;
    controls.update();
  }

  function setMesh(mesh) {
    if (state.mesh) scene.remove(state.mesh);
    state.mesh = mesh;
    scene.add(mesh);
  }

  // Named highlight overlays ('exit', 'source', 'hover'); pass null to clear.
  function setHighlight(name, mesh) {
    const previous = highlights.get(name);
    if (previous) {
      scene.remove(previous);
      previous.geometry?.dispose();
      previous.material?.dispose();
      highlights.delete(name);
    }
    if (mesh) {
      highlights.set(name, mesh);
      scene.add(mesh);
    }
  }

  function setRays(pathsByStatus) {
    clearGroup(rayGroup);
    for (const status of Object.keys(RAY_COLORS)) {
      const paths = pathsByStatus[status] ?? [];
      if (paths.length) rayGroup.add(lineSegments(paths, RAY_COLORS[status]));
    }
  }

  function setupSource(position, onMove) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(state.sceneRadius * 0.03, 20, 20),
      new THREE.MeshBasicMaterial({ color: SOURCE_COLOR }),
    );
    marker.position.set(position.x, position.y, position.z);
    scene.add(marker);
    state.sourceMarker = marker;

    transform.attach(marker);
    transform.setSize(0.7);
    transform.addEventListener('objectChange', () => {
      onMove({ x: marker.position.x, y: marker.position.y, z: marker.position.z });
    });

    return { setPosition(next) { marker.position.set(next.x, next.y, next.z); } };
  }

  function setAim(from, to) {
    if (state.aimLine) scene.remove(state.aimLine);
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    state.aimLine = new THREE.Line(geometry, new THREE.LineDashedMaterial({
      color: AIM_COLOR, dashSize: state.sceneRadius * 0.08, gapSize: state.sceneRadius * 0.05,
    }));
    state.aimLine.computeLineDistances();
    scene.add(state.aimLine);
  }

  const picker = new THREE.Raycaster();
  picker.firstHitOnly = true;

  function faceAt(clientX, clientY) {
    if (!state.mesh) return null;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    picker.setFromCamera(ndc, camera);
    const hits = picker.intersectObject(state.mesh, false);
    return hits.length ? hits[0].faceIndex : null;
  }

  // Click (not drag) on the mesh → callback(faceIndex).
  function onPickFace(callback) {
    let downX = 0;
    let downY = 0;
    canvas.addEventListener('pointerdown', (event) => { downX = event.clientX; downY = event.clientY; });
    canvas.addEventListener('pointerup', (event) => {
      if (transform.dragging) return;
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > CLICK_DRAG_TOLERANCE_PX) return;
      const faceIndex = faceAt(event.clientX, event.clientY);
      if (faceIndex !== null) callback(faceIndex);
    });
  }

  // Hover over the mesh → callback(faceIndex | null), throttled to one per frame
  // and only when the hovered face changes. Suppressed while dragging.
  function onHoverFace(callback) {
    let pending = false;
    let lastEvent = null;
    let lastFace = -2;
    let dragging = false;

    canvas.addEventListener('pointerdown', () => { dragging = true; });
    window.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('pointerleave', () => { lastFace = -2; callback(null); });
    canvas.addEventListener('pointermove', (event) => {
      if (dragging) return;
      lastEvent = event;
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const faceIndex = faceAt(lastEvent.clientX, lastEvent.clientY);
        const key = faceIndex ?? -1;
        if (key !== lastFace) { lastFace = key; callback(faceIndex); }
      });
    });
  }

  function start() {
    resize();
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
  }

  return {
    scene, camera, frameScene, setMesh, setHighlight, setRays,
    setupSource, setAim, onPickFace, onHoverFace, start,
  };
}

function clearGroup(group) {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i];
    child.geometry?.dispose();
    child.material?.dispose();
    group.remove(child);
  }
}

function lineSegments(paths, color) {
  const vertices = [];
  for (const path of paths) {
    for (let i = 0; i + 1 < path.length; i++) {
      vertices.push(path[i].x, path[i].y, path[i].z, path[i + 1].x, path[i + 1].y, path[i + 1].z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
  return new THREE.LineSegments(geometry, material);
}
