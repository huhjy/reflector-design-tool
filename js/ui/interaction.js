// Canvas mouse/touch interaction: drag handles, pan, zoom
import { getExitEndpoints } from '../scene.js';

export class Interaction {
  constructor(canvas, renderer, scene, onChange) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.scene = scene;
    this.onChange = onChange;
    this.dragging = null;
    this.panning = false;
    this.panStart = null;
    this.panOffset = null;
    this.bindEvents();
  }

  bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('mouseleave', () => this.onMouseUp());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  onMouseDown(e) {
    const pos = this.getMousePos(e);
    if (e.button === 1 || e.button === 2) {
      this.panning = true;
      this.panStart = pos;
      this.panOffset = { x: this.renderer.offsetX, y: this.renderer.offsetY };
      return;
    }
    const handle = this.renderer.hitTestHandle(pos.x, pos.y);
    if (handle) {
      this.dragging = { id: handle.id };
      this.canvas.style.cursor = 'grabbing';
    }
  }

  onMouseMove(e) {
    const pos = this.getMousePos(e);
    if (this.panning && this.panStart) {
      const dx = (pos.x - this.panStart.x) / this.renderer.scale;
      const dy = -(pos.y - this.panStart.y) / this.renderer.scale;
      this.renderer.offsetX = this.panOffset.x + dx;
      this.renderer.offsetY = this.panOffset.y + dy;
      this.renderer.render();
      return;
    }
    if (this.dragging) {
      const world = this.renderer.toWorld(pos.x, pos.y);
      this.applyDrag(this.dragging.id, world);
      this.onChange();
      return;
    }
    const handle = this.renderer.hitTestHandle(pos.x, pos.y);
    this.renderer.hoveredHandle = handle;
    this.canvas.style.cursor = handle ? 'grab' : 'crosshair';
    const world = this.renderer.toWorld(pos.x, pos.y);
    const coordsEl = document.getElementById('coords');
    if (coordsEl) coordsEl.textContent = `${world.x.toFixed(1)}, ${world.y.toFixed(1)}`;
  }

  onMouseUp() {
    if (this.dragging) {
      this.canvas.style.cursor = 'crosshair';
      this.dragging = null;
    }
    this.panning = false;
    this.panStart = null;
  }

  onWheel(e) {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.5, Math.min(30, this.renderer.scale * zoomFactor));
    const pos = this.getMousePos(e);
    const worldBefore = this.renderer.toWorld(pos.x, pos.y);
    this.renderer.scale = newScale;
    const worldAfter = this.renderer.toWorld(pos.x, pos.y);
    this.renderer.offsetX += worldAfter.x - worldBefore.x;
    this.renderer.offsetY += worldAfter.y - worldBefore.y;
    this.renderer.render();
  }

  applyDrag(handleId, world) {
    const s = this.scene;
    const snap = (v) => Math.round(v * 2) / 2;

    // ── Exit area handles ──
    if (handleId === 'exit-center') {
      s.exitArea.center.x = snap(world.x);
      s.exitArea.center.y = snap(world.y);

    } else if (handleId === 'exit-p1' || handleId === 'exit-p2') {
      // Drag endpoint → recompute center, width, angle
      const { p1, p2 } = getExitEndpoints(s.exitArea);
      let newP1, newP2;
      if (handleId === 'exit-p1') {
        newP1 = { x: world.x, y: world.y };
        newP2 = { ...p2 };
      } else {
        newP1 = { ...p1 };
        newP2 = { x: world.x, y: world.y };
      }
      s.exitArea.center.x = (newP1.x + newP2.x) / 2;
      s.exitArea.center.y = (newP1.y + newP2.y) / 2;
      const dx = newP2.x - newP1.x;
      const dy = newP2.y - newP1.y;
      s.exitArea.width = Math.max(5, Math.sqrt(dx * dx + dy * dy));
      s.exitArea.angleDeg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);

    } else if (handleId === 'exit-rotate') {
      // Rotate around center
      const dx = world.x - s.exitArea.center.x;
      const dy = world.y - s.exitArea.center.y;
      // The rotate handle is along the normal, so the line angle is perpendicular
      const normalAngle = Math.atan2(dy, dx) * 180 / Math.PI;
      s.exitArea.angleDeg = Math.round(normalAngle - 90);

    // ── Reflector handles ──
    } else if (handleId === 'reflector-vertex') {
      s.reflector.vertex.x = snap(world.x);
      s.reflector.vertex.y = snap(world.y);

    } else if (handleId === 'reflector-center') {
      s.reflector.center.x = snap(world.x);
      s.reflector.center.y = snap(world.y);

    } else if (handleId.startsWith('vtx-')) {
      // Independent vertex movement
      const idx = parseInt(handleId.split('-')[1], 10);
      s.reflector.vertices[idx].x = snap(world.x);
      s.reflector.vertices[idx].y = snap(world.y);

    } else if (handleId.startsWith('cp-')) {
      const idx = parseInt(handleId.split('-')[1], 10);
      s.reflector.controlPoints[idx].x = snap(world.x);
      s.reflector.controlPoints[idx].y = snap(world.y);
    }
  }
}
