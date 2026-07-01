// App glue for the 3D reflector analyzer: load an airspace STL, place the LED
// (drag or click a pocket face) and pick the exit face, trace the 135° beam
// through the chrome walls, and report how much light exits, where it goes, and
// how much lands within the target direction.

import { parseStl, boundsOf } from './engine/stl.js';
import { traceRay } from './engine/tracer-core.js';
import { coneEmission } from './engine/light-source.js';
import { largestFaceSeedIndex, buildVertexAdjacency, selectConnectedFace } from './engine/exit-face.js';
import { analyzeTrace } from './engine/analysis3d.js';
import { fitBeamCone, elevationDeg, elevatedDirection, angleBetweenDeg, onTargetFraction } from './engine/beam-fit.js';
import { normalize, subtract, dot, scale } from './engine/geom3.js';
import { buildAirspaceMesh, buildFaceHighlight } from './renderer/mesh.js';
import { buildBeamCone, buildTargetArrow } from './renderer/markers.js';
import { makeBvhIntersector } from './renderer/bvh-intersector.js';
import { createViewport } from './renderer/viewport.js';
import { drawAngularPlot } from './renderer/plot.js';

const DRAWN_PATHS = { exit: 400, absorbed: 150, escaped: 120 };
const EXIT_BEAM_FRACTION = 0.9; // Length of the drawn output beam (× scene radius).
const COLOR = { exit: 0x22d3ee, source: 0xf59e0b, hover: 0xfacc15, beam: 0x7c3aed, target: 0xef4444 };

const ui = collectUi();
const viewport = createViewport(ui.canvas);
viewport.start();
viewport.onPickFace(onFacePicked);
viewport.onHoverFace(onHoverFace);

const state = {
  triangles: [],
  adjacency: null,
  mesh: null,
  intersect: null,
  radius: 1,
  isExit: [],
  exit: { normal: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 }, area: 0 },
  source: { x: 0, y: 0, z: 0 },
  aim: { x: 0, y: 0, z: 1 },
  autoAimAtExit: true,
  sourceHandle: null,
  halfAngleDeg: 67.5,
  rayCount: 3000,
  reflectivity: 0.65,
  pickMode: 'none',
  exitSelected: false,
  sourceSelected: false,
  show: { exit: true, absorbed: false, escaped: false },
  showFullPaths: true,
  upAxis: { x: 0, y: 0, z: 1 },
  targetElevationDeg: 5, // + up, − down.
  onTargetConeDeg: 10,
  showBeam: true,
  lastResults: [],
};

wireControls();
loadSample(ui.sample.value);

// Debug hook (mirrors the 2D app's window.__app).
window.__app3d = { state, viewport };

async function loadSample(url) {
  loadStl(await fetchArrayBuffer(url), fileNameOf(url));
}

// Load a user-dropped or picked file. Validates and reports errors explicitly.
async function loadFile(file) {
  if (!/\.stl$/i.test(file.name)) {
    ui.modelInfo.textContent = `${file.name}: not an .stl file`;
    return;
  }
  try {
    loadStl(await file.arrayBuffer(), file.name);
  } catch (error) {
    ui.modelInfo.textContent = `Could not load ${file.name}: ${error.message}`;
  }
}

function loadStl(buffer, label) {
  const raw = parseStl(buffer);
  const bounds = boundsOf(raw);
  state.triangles = recenter(raw, bounds.center);
  state.adjacency = buildVertexAdjacency(state.triangles);
  state.radius = 0.5 * Math.hypot(bounds.size.x, bounds.size.y, bounds.size.z);

  const mesh = buildAirspaceMesh(state.triangles);
  state.mesh = mesh;
  state.intersect = makeBvhIntersector(mesh, (faceIndex) => (state.isExit[faceIndex] ? 'exit' : 'reflect'));
  viewport.setMesh(mesh);
  viewport.frameScene(state.radius);

  ensureSourceHandle();
  state.source = { x: 0, y: 0, z: 0 };
  state.autoAimAtExit = true;
  state.sourceHandle.setPosition(state.source);
  writeSourceInputs(state.source);
  viewport.setHighlight('source', null);

  applyExitFace(largestFaceSeedIndex(state.triangles));
  state.exitSelected = true;
  state.sourceSelected = false;
  armPick('none');
  ui.modelInfo.textContent =
    `${label} · ${raw.length.toLocaleString()} tris · ${fmt(bounds.size.x)} × ${fmt(bounds.size.y)} × ${fmt(bounds.size.z)} mm`;
  retrace();
}

function retrace() {
  const aim = state.autoAimAtExit ? normalize(subtract(state.exit.center, state.source)) : state.aim;
  const emission = coneEmission(aim, state.halfAngleDeg, state.rayCount);

  const results = new Array(emission.length);
  for (let i = 0; i < emission.length; i++) {
    const ray = emission[i];
    const traced = traceRay(state.source, ray.direction, state.intersect, {
      reflectivity: state.reflectivity,
      intensity: ray.weight,
    });
    results[i] = {
      status: traced.status,
      intensity: traced.intensity,
      bounces: traced.bounces,
      direction: traced.direction,
      emitted: ray.weight,
      path: traced.path,
    };
  }
  state.lastResults = results;

  viewport.setAim(state.source, addScaled(state.source, aim, state.radius * 0.6));
  redrawRays();
  showAnalysis(analyzeTrace(results, { axis: targetDirection() }));
  updateBeam();
}

function targetDirection() {
  return elevatedDirection(state.exit.normal, state.upAxis, state.targetElevationDeg);
}

function redrawRays() {
  viewport.setRays(drawnPaths(state.lastResults));
}

function drawnPaths(results) {
  const buckets = { exit: [], absorbed: [], escaped: [] };
  for (const result of results) {
    if (!state.show[result.status]) continue;
    if (result.status === 'exit') {
      buckets.exit.push(state.showFullPaths
        ? exitFullPath(result.path, result.direction)
        : exitBeamSegment(result.path, result.direction));
    } else {
      buckets[result.status].push(result.path);
    }
  }
  return {
    exit: sample(buckets.exit, DRAWN_PATHS.exit),
    absorbed: sample(buckets.absorbed, DRAWN_PATHS.absorbed),
    escaped: sample(buckets.escaped, DRAWN_PATHS.escaped),
  };
}

// Full internal bounce path plus the outgoing beam past the exit face.
function exitFullPath(path, direction) {
  return [...path, addScaled(path[path.length - 1], direction, state.radius * EXIT_BEAM_FRACTION)];
}

// Just the outgoing beam segment, from where the ray leaves the exit face.
function exitBeamSegment(path, direction) {
  const exitPoint = path[path.length - 1];
  return [exitPoint, addScaled(exitPoint, direction, state.radius * EXIT_BEAM_FRACTION)];
}

function showAnalysis(report) {
  ui.efficiency.textContent = `${(report.efficiency * 100).toFixed(1)}%`;
  ui.countExit.textContent = report.counts.exit.toLocaleString();
  ui.countAbsorbed.textContent = report.counts.absorbed.toLocaleString();
  ui.countEscaped.textContent = report.counts.escaped.toLocaleString();
  ui.avgBounces.textContent = report.avgExitBounces.toFixed(1);
  ui.beamPeak.textContent = `${report.angle.peakDeg.toFixed(0)}° / ${report.angle.meanDeg.toFixed(0)}°`;
  ui.beamFwhm.textContent = `${report.angle.fwhmDeg.toFixed(0)}°`;
  drawAngularPlot(ui.chart, report.angle);
}

// Fit a cone to the exit rays, compare to the goal, and score on-target flux.
function updateBeam() {
  const cone = fitBeamCone(state.lastResults, [0.5, 0.9]);
  if (cone.flux === 0) {
    viewport.setHighlight('beamcone', null);
    viewport.setHighlight('target', null);
    for (const el of [ui.beamElev, ui.beamGoal, ui.beamElevErr, ui.beamCone, ui.beamDev, ui.onTarget]) el.textContent = '—';
    return;
  }

  const target = targetDirection();
  const beamElev = elevationDeg(cone.axis, state.upAxis);
  const deviation = angleBetweenDeg(cone.axis, target);
  const elevError = beamElev - state.targetElevationDeg;

  const outputRays = state.lastResults
    .filter((r) => r.status === 'exit')
    .map((r) => ({ direction: r.direction, intensity: r.intensity }));
  const onTarget = onTargetFraction(outputRays, target, state.onTargetConeDeg);

  ui.beamElev.textContent = elevationText(beamElev);
  ui.beamGoal.textContent = elevationText(state.targetElevationDeg);
  ui.beamElevErr.textContent = `${elevError >= 0 ? '+' : ''}${elevError.toFixed(1)}° (${elevError >= 0 ? 'too high' : 'too low'})`;
  ui.beamCone.textContent = `${cone.halfAngles[0].toFixed(0)}° / ${cone.halfAngles[1].toFixed(0)}°`;
  ui.beamDev.textContent = `${deviation.toFixed(1)}°`;
  ui.onTarget.textContent = `${(onTarget * 100).toFixed(1)}%`;

  if (state.showBeam) {
    const length = state.radius * 1.3;
    viewport.setHighlight('beamcone', buildBeamCone(state.exit.center, cone.axis, cone.halfAngles[1], length, COLOR.beam));
    viewport.setHighlight('target', buildTargetArrow(state.exit.center, target, length, COLOR.target));
  } else {
    viewport.setHighlight('beamcone', null);
    viewport.setHighlight('target', null);
  }
}

function elevationText(elevationDegValue) {
  if (Math.abs(elevationDegValue) < 0.05) return '0° (level)';
  return `${Math.abs(elevationDegValue).toFixed(1)}° ${elevationDegValue < 0 ? 'down' : 'up'}`;
}

// ── Face picking ─────────────────────────────────────────────────────────────

function applyExitFace(faceIndex) {
  const face = selectConnectedFace(state.triangles, state.adjacency, faceIndex);
  state.isExit = face.isExit;
  state.exit = { normal: orientOutward(face.normal, face.center), center: face.center, area: face.area };
  viewport.setHighlight('exit', buildFaceHighlight(state.triangles, face.isExit, COLOR.exit));
  ui.exitArea.textContent = `${face.area.toFixed(1)} mm²`;
  ui.exitNormal.textContent = vecText(state.exit.normal);
}

function applySourceFace(faceIndex) {
  const face = selectConnectedFace(state.triangles, state.adjacency, faceIndex);
  const inward = scale(orientOutward(face.normal, face.center), -1);
  const position = addScaled(face.center, inward, state.radius * 0.05);

  state.source = position;
  state.aim = inward;
  state.autoAimAtExit = false;
  state.sourceHandle?.setPosition(position);
  writeSourceInputs(position);
  viewport.setHighlight('source', buildFaceHighlight(state.triangles, face.isExit, COLOR.source));
}

function onFacePicked(faceIndex) {
  if (state.pickMode === 'exit') { applyExitFace(faceIndex); state.exitSelected = true; }
  else if (state.pickMode === 'source') { applySourceFace(faceIndex); state.sourceSelected = true; }
  else return;
  armPick('none');
  scheduleRetrace();
}

function onHoverFace(faceIndex) {
  if (state.pickMode === 'none' || faceIndex === null) { viewport.setHighlight('hover', null); return; }
  const face = selectConnectedFace(state.triangles, state.adjacency, faceIndex);
  viewport.setHighlight('hover', buildFaceHighlight(state.triangles, face.isExit, COLOR.hover, { opacity: 0.6, depthTest: false, renderOrder: 10 }));
}

function armPick(mode) {
  state.pickMode = mode;
  if (mode === 'none') viewport.setHighlight('hover', null);
  ui.pickExit.classList.toggle('active', mode === 'exit');
  ui.pickSource.classList.toggle('active', mode === 'source');
  ui.pickExit.classList.toggle('selected', mode !== 'exit' && state.exitSelected);
  ui.pickSource.classList.toggle('selected', mode !== 'source' && state.sourceSelected);
  ui.pickExit.textContent = mode === 'exit' ? 'Selecting… click a face'
    : state.exitSelected ? '✓ Exit face set — reselect' : 'Click a face to set exit';
  ui.pickSource.textContent = mode === 'source' ? 'Selecting… click a face'
    : state.sourceSelected ? '✓ Source placed — reselect' : 'Click a face to place source';
  ui.hint.textContent = mode === 'source' ? 'Hover a face — it highlights — then click to place the LED'
    : mode === 'exit' ? 'Hover a face — it highlights — then click to set the exit'
    : 'Drag to orbit · use the buttons to set the source or exit face';
}

function onSourceMoved(position) {
  state.source = position;
  writeSourceInputs(position);
  scheduleRetrace();
}

let retracePending = false;
function scheduleRetrace() {
  if (retracePending) return;
  retracePending = true;
  requestAnimationFrame(() => { retracePending = false; retrace(); });
}

// ── Controls ─────────────────────────────────────────────────────────────────

function wireControls() {
  ui.sample.addEventListener('change', () => loadSample(ui.sample.value));
  setupFileLoading();

  for (const axis of ['x', 'y', 'z']) {
    ui.source[axis].addEventListener('input', () => {
      state.source = readSourceInputs();
      state.sourceHandle?.setPosition(state.source);
      scheduleRetrace();
    });
  }

  ui.halfAngle.addEventListener('input', () => {
    state.halfAngleDeg = clampNumber(ui.halfAngle.value, 1, 90, 67.5);
    scheduleRetrace();
  });
  ui.rayCount.addEventListener('input', () => {
    state.rayCount = parseInt(ui.rayCount.value, 10);
    ui.rayCountVal.textContent = state.rayCount.toLocaleString();
    scheduleRetrace();
  });
  ui.reflectivity.addEventListener('input', () => {
    state.reflectivity = parseFloat(ui.reflectivity.value);
    ui.reflectivityVal.textContent = state.reflectivity.toFixed(2);
    scheduleRetrace();
  });

  ui.pickExit.addEventListener('click', () => armPick(state.pickMode === 'exit' ? 'none' : 'exit'));
  ui.pickSource.addEventListener('click', () => armPick(state.pickMode === 'source' ? 'none' : 'source'));

  for (const status of ['exit', 'absorbed', 'escaped']) {
    ui.show[status].addEventListener('change', () => { state.show[status] = ui.show[status].checked; redrawRays(); });
  }
  ui.showFullPaths.addEventListener('change', () => { state.showFullPaths = ui.showFullPaths.checked; redrawRays(); });

  ui.upAxis.addEventListener('change', () => { state.upAxis = vecFromCsv(ui.upAxis.value); updateBeam(); });
  ui.targetElev.addEventListener('input', () => { state.targetElevationDeg = clampNumber(ui.targetElev.value, -90, 90, 5); updateBeam(); });
  ui.onTargetCone.addEventListener('input', () => { state.onTargetConeDeg = clampNumber(ui.onTargetCone.value, 1, 90, 10); updateBeam(); });
  ui.showBeam.addEventListener('change', () => { state.showBeam = ui.showBeam.checked; updateBeam(); });
}

function ensureSourceHandle() {
  if (!state.sourceHandle) state.sourceHandle = viewport.setupSource(state.source, onSourceMoved);
}

// File picker + window-wide drag & drop of an STL, with a drop overlay.
function setupFileLoading() {
  ui.stlFile.addEventListener('change', () => {
    if (ui.stlFile.files[0]) loadFile(ui.stlFile.files[0]);
    ui.stlFile.value = ''; // allow re-picking the same file
  });

  let dragDepth = 0;
  const showOverlay = (on) => ui.dropOverlay.classList.toggle('active', on);

  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth += 1; showOverlay(true); });
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth -= 1; if (dragDepth <= 0) { dragDepth = 0; showOverlay(false); } });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    showOverlay(false);
    const files = [...(e.dataTransfer?.files ?? [])];
    const stl = files.find((f) => /\.stl$/i.test(f.name)) ?? files[0];
    if (stl) loadFile(stl);
  });
}

// ── UI plumbing ──────────────────────────────────────────────────────────────

function collectUi() {
  const byId = (id) => document.getElementById(id);
  return {
    canvas: byId('viewport'),
    hint: byId('hint'),
    sample: byId('sample'),
    stlFile: byId('stl-file'),
    dropOverlay: byId('drop-overlay'),
    modelInfo: byId('model-info'),
    source: { x: byId('src-x'), y: byId('src-y'), z: byId('src-z') },
    halfAngle: byId('half-angle'),
    rayCount: byId('ray-count'),
    rayCountVal: byId('ray-count-val'),
    reflectivity: byId('reflectivity'),
    reflectivityVal: byId('reflectivity-val'),
    pickExit: byId('pick-exit'),
    pickSource: byId('pick-source'),
    exitArea: byId('exit-area'),
    exitNormal: byId('exit-normal'),
    efficiency: byId('efficiency'),
    countExit: byId('count-exit'),
    countAbsorbed: byId('count-absorbed'),
    countEscaped: byId('count-escaped'),
    avgBounces: byId('avg-bounces'),
    beamPeak: byId('beam-peak'),
    beamFwhm: byId('beam-fwhm'),
    chart: byId('chart'),
    show: { exit: byId('show-exit'), absorbed: byId('show-absorbed'), escaped: byId('show-escaped') },
    showFullPaths: byId('show-full-paths'),
    upAxis: byId('up-axis'),
    targetElev: byId('target-elev'),
    onTargetCone: byId('on-target-cone'),
    showBeam: byId('show-beam'),
    beamElev: byId('beam-elev'),
    beamGoal: byId('beam-goal'),
    beamElevErr: byId('beam-elev-err'),
    beamCone: byId('beam-cone'),
    beamDev: byId('beam-dev'),
    onTarget: byId('on-target'),
  };
}

function writeSourceInputs(position) {
  ui.source.x.value = position.x.toFixed(2);
  ui.source.y.value = position.y.toFixed(2);
  ui.source.z.value = position.z.toFixed(2);
}

function readSourceInputs() {
  return {
    x: parseFloat(ui.source.x.value) || 0,
    y: parseFloat(ui.source.y.value) || 0,
    z: parseFloat(ui.source.z.value) || 0,
  };
}

function recenter(triangles, center) {
  const shift = (v) => ({ x: v.x - center.x, y: v.y - center.y, z: v.z - center.z });
  return triangles.map((t) => ({ a: shift(t.a), b: shift(t.b), c: shift(t.c) }));
}

function orientOutward(normal, center) {
  return dot(normal, center) < 0 ? scale(normal, -1) : normal;
}

function addScaled(point, direction, distance) {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance,
    z: point.z + direction.z * distance,
  };
}

function sample(items, max) {
  if (items.length <= max) return items;
  const step = items.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(items[Math.floor(i * step)]);
  return out;
}

async function fetchArrayBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${url} failed (${response.status})`);
  return response.arrayBuffer();
}

function clampNumber(value, min, max, fallback) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function vecFromCsv(csv) {
  const [x, y, z] = csv.split(',').map(Number);
  return { x, y, z };
}

function fileNameOf(url) {
  return url.split('/').pop();
}

function vecText(v) {
  return `${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)}`;
}

function fmt(n) {
  return n.toFixed(2);
}
