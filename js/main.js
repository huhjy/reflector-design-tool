// Bootstrap and glue
import { createDefaultScene, migrateScene } from './scene.js';
import { traceScene } from './engine/tracer.js';
import { Renderer } from './renderer/canvas-renderer.js';
import { Charts } from './ui/charts.js';
import { Controls } from './ui/controls.js';
import { Interaction } from './ui/interaction.js';
import { UndoManager } from './ui/history.js';
import { startOptimizer, objectiveDescriptions } from './engine/optimizer.js';

// Expose for reset functionality
window.__sceneModule = { createDefaultScene, migrateScene };

const scene = createDefaultScene();

// Undo / Redo
const undoMgr = new UndoManager(50);
window.__undoManager = undoMgr;       // accessible from controls + interaction

const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');

undoMgr.onChange((canUndo, canRedo) => {
  if (btnUndo) btnUndo.disabled = !canUndo;
  if (btnRedo) btnRedo.disabled = !canRedo;
});

function applySnapshot(snapshot) {
  Object.assign(scene, snapshot);
  controls.syncFromScene();
  controls.updateShapeVisibility();
  controls.renderVertexList();
  simulate();
}

btnUndo?.addEventListener('click', () => {
  const s = undoMgr.undo(scene);
  if (s) applySnapshot(s);
});
btnRedo?.addEventListener('click', () => {
  const s = undoMgr.redo(scene);
  if (s) applySnapshot(s);
});

document.addEventListener('keydown', (e) => {
  // Ignore when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    const s = undoMgr.undo(scene);
    if (s) applySnapshot(s);
  } else if ((e.ctrlKey && e.key === 'z' && e.shiftKey) || (e.ctrlKey && e.key === 'y')) {
    e.preventDefault();
    const s = undoMgr.redo(scene);
    if (s) applySnapshot(s);
  }
});

// Main canvas
const canvas = document.getElementById('main-canvas');
const renderer = new Renderer(canvas);
renderer.setScene(scene);

// Charts
const chartCanvas = document.getElementById('distribution-chart');
const angularCanvas = document.getElementById('angular-chart');
const resultsEl = document.getElementById('results');
const charts = new Charts(chartCanvas, angularCanvas, resultsEl);

// Simulation
function simulate() {
  const result = traceScene(scene);
  renderer.setTraceResult(result);
  renderer.render();
  charts.update(result, scene);
}

// Controls — pass undoMgr so controls can push snapshots before changes
const controls = new Controls(scene, () => {
  controls.updateShapeVisibility();
  simulate();
}, undoMgr);

// Canvas interaction — pass undoMgr so drag-start pushes a snapshot
const interaction = new Interaction(canvas, renderer, scene, () => {
  controls.syncFromScene();
  simulate();
}, undoMgr);

// Resize handler
function resizeCanvas() {
  const container = canvas.parentElement;
  const w = container.offsetWidth;
  const h = container.offsetHeight;

  if (w === 0 || h === 0) {
    requestAnimationFrame(resizeCanvas);
    return;
  }

  canvas.width = w;
  canvas.height = h;

  const sceneHeight = 110;
  const sceneWidth = 140;
  const scaleY = (h * 0.85) / sceneHeight;
  const scaleX = (w * 0.9) / sceneWidth;
  renderer.scale = Math.min(scaleX, scaleY);

  // Size both chart canvases
  const chartContainer = chartCanvas.parentElement;
  const cw = chartContainer.offsetWidth || 196;
  chartCanvas.width = cw;
  chartCanvas.height = 110;
  if (angularCanvas) {
    angularCanvas.width = cw;
    angularCanvas.height = 110;
  }

  simulate();
}

window.addEventListener('resize', resizeCanvas);

function initResize() {
  const container = canvas.parentElement;
  if (container.offsetWidth > 0 && container.offsetHeight > 0) {
    resizeCanvas();
  } else {
    requestAnimationFrame(initResize);
  }
}
if (document.readyState === 'complete') {
  initResize();
} else {
  window.addEventListener('load', initResize);
}

// Toggle rays
document.getElementById('toggle-rays')?.addEventListener('change', (e) => {
  renderer.showRays = e.target.checked;
  renderer.render();
});

// ── Optimizer ──

let optimizerRunning = false;
let stopOptimizer = false;

const btnOptimize = document.getElementById('btn-optimize');
const btnStopOpt = document.getElementById('btn-stop-optimize');
const optObjective = document.getElementById('opt-objective');
const optIterations = document.getElementById('opt-iterations');
const optProgress = document.getElementById('opt-progress');
const optBar = document.getElementById('opt-bar');
const optStatus = document.getElementById('opt-status');

// Iterations slider display
optIterations?.addEventListener('input', () => {
  document.getElementById('opt-iterations-val').textContent = optIterations.value;
});

btnOptimize?.addEventListener('click', () => {
  if (optimizerRunning) return;

  // Save state before optimizer so user can undo the whole optimization
  undoMgr.push(scene);

  optimizerRunning = true;
  stopOptimizer = false;
  btnOptimize.disabled = true;
  btnStopOpt.style.display = 'inline-block';
  optProgress.style.display = 'block';

  // Temporarily increase ray count for more accurate evaluation
  const origRayCount = scene.lightSource.rayCount;
  scene.lightSource.rayCount = Math.max(origRayCount, 200);

  startOptimizer(scene, optObjective.value, {
    maxIterations: parseInt(optIterations.value, 10) || 500,
    shouldStop: () => stopOptimizer,
    onProgress({ iteration, maxIterations, score, initialScore, improvement, result }) {
      const pct = (iteration / maxIterations) * 100;
      optBar.style.width = pct + '%';
      optStatus.textContent = `Iteration ${iteration}/${maxIterations} — Score: ${score.toFixed(1)} (${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)})`;

      // Live update the display
      renderer.setTraceResult(result);
      renderer.render();
      charts.update(result, scene);
    },
    onComplete({ initialScore, finalScore, iterations, improvement }) {
      optimizerRunning = false;
      btnOptimize.disabled = false;
      btnStopOpt.style.display = 'none';

      // Restore ray count and do final simulation
      scene.lightSource.rayCount = origRayCount;
      controls.syncFromScene();
      controls.renderVertexList();
      simulate();

      optStatus.textContent = `Done! ${iterations} iterations. Score: ${initialScore.toFixed(1)} → ${finalScore.toFixed(1)} (${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)})`;
    },
  });
});

btnStopOpt?.addEventListener('click', () => {
  stopOptimizer = true;
});
