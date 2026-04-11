// Wire HTML controls to scene model
import { computeVertexSegmentInfo } from '../engine/reflector-shapes.js';

export class Controls {
  constructor(scene, onChange) {
    this.scene = scene;
    this.onChange = onChange;
    this._debounceTimer = null;
    this.init();
  }

  init() {
    // Light source
    this.bind('light-ray-count', 'lightSource.rayCount', 'int');
    this.bind('light-angle-min', 'lightSource.emissionAngleMin', 'float');
    this.bind('light-angle-max', 'lightSource.emissionAngleMax', 'float');
    this.bind('light-profile', 'lightSource.intensityProfile', 'string');

    // Exit area
    this.bind('exit-center-x', 'exitArea.center.x', 'float');
    this.bind('exit-center-y', 'exitArea.center.y', 'float');
    this.bind('exit-angle', 'exitArea.angleDeg', 'float');
    this.bind('exit-width', 'exitArea.width', 'float');

    // Reflector common
    this.bind('reflector-type', 'reflector.type', 'string');
    this.bind('reflector-reflectivity', 'reflector.reflectivity', 'float');
    this.bind('reflector-surface', 'reflector.surfaceType', 'string');

    // Parabolic
    this.bind('para-vertex-x', 'reflector.vertex.x', 'float');
    this.bind('para-vertex-y', 'reflector.vertex.y', 'float');
    this.bind('para-focal', 'reflector.focalLength', 'float');
    this.bind('para-aperture', 'reflector.aperture', 'float');

    // Elliptical
    this.bind('elli-center-x', 'reflector.center.x', 'float');
    this.bind('elli-center-y', 'reflector.center.y', 'float');
    this.bind('elli-major', 'reflector.semiMajor', 'float');
    this.bind('elli-minor', 'reflector.semiMinor', 'float');
    this.bind('elli-rotation', 'reflector.rotation', 'float');
    this.bind('elli-arc-start', 'reflector.arcStartDeg', 'float');
    this.bind('elli-arc-end', 'reflector.arcEndDeg', 'float');

    // Freeform mode
    this.bind('freeform-mode', 'reflector.freeformMode', 'string');
    this.bind('mirror-x', 'reflector.mirrorX', 'bool');

    // Reflector type switching
    const typeEl = document.getElementById('reflector-type');
    if (typeEl) {
      typeEl.addEventListener('change', () => this.updateShapeVisibility());
      this.updateShapeVisibility();
    }

    // Freeform mode switching
    const fmEl = document.getElementById('freeform-mode');
    if (fmEl) {
      fmEl.addEventListener('change', () => this.updateFreeformVisibility());
      this.updateFreeformVisibility();
    }

    // Vertex list
    this.renderVertexList();

    // Add vertex button
    document.getElementById('btn-add-vertex')?.addEventListener('click', () => {
      const verts = this.scene.reflector.vertices;
      if (verts.length > 0) {
        const last = verts[verts.length - 1];
        verts.push({ x: last.x + 5, y: last.y - 15 });
      } else {
        verts.push({ x: -40, y: 60 });
      }
      this.renderVertexList();
      this.debounceChange();
    });

    // Save/Load/Reset
    document.getElementById('btn-save')?.addEventListener('click', () => this.save());
    document.getElementById('btn-load')?.addEventListener('click', () => this.load());
    document.getElementById('btn-reset')?.addEventListener('click', () => this.reset());
    document.getElementById('file-input')?.addEventListener('change', (e) => this.handleFile(e));
  }

  bind(elementId, path, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const val = this.getPath(path);
    if (type === 'bool') {
      el.checked = !!val;
    } else if (el.type === 'range' || el.type === 'number') {
      el.value = val;
      const display = document.getElementById(elementId + '-val');
      if (display) display.textContent = val;
    } else {
      el.value = val;
    }
    const handler = () => {
      let newVal;
      if (type === 'int') newVal = parseInt(el.value, 10);
      else if (type === 'float') newVal = parseFloat(el.value);
      else if (type === 'bool') newVal = el.checked;
      else newVal = el.value;
      this.setPath(path, newVal);
      const display = document.getElementById(elementId + '-val');
      if (display) display.textContent = el.type === 'range' ? newVal : '';
      this.debounceChange();
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  }

  getPath(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.scene);
  }

  setPath(path, value) {
    const keys = path.split('.');
    let obj = this.scene;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
  }

  debounceChange() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this.onChange(), 16);
  }

  updateShapeVisibility() {
    const type = this.scene.reflector.type;
    document.getElementById('params-parabolic').style.display = type === 'parabolic' ? 'block' : 'none';
    document.getElementById('params-elliptical').style.display = type === 'elliptical' ? 'block' : 'none';
    document.getElementById('params-freeform').style.display = type === 'freeform' ? 'block' : 'none';
  }

  updateFreeformVisibility() {
    const mode = this.scene.reflector.freeformMode;
    const polyEl = document.getElementById('freeform-polyline-ui');
    const bezEl = document.getElementById('freeform-bezier-ui');
    if (polyEl) polyEl.style.display = mode === 'polyline' ? 'block' : 'none';
    if (bezEl) bezEl.style.display = mode === 'bezier' ? 'block' : 'none';
  }

  renderVertexList() {
    const container = document.getElementById('vertex-list');
    if (!container) return;

    const verts = this.scene.reflector.vertices || [];
    const segInfo = computeVertexSegmentInfo(verts);
    container.innerHTML = '';

    verts.forEach((v, i) => {
      const row = document.createElement('div');
      row.className = 'vertex-row';

      const info = segInfo[i]; // segment from this vertex to next (may be undefined for last)
      const distLabel = info ? `${info.length.toFixed(1)}mm @ ${info.angleDeg.toFixed(0)}\u00B0` : '';

      row.innerHTML = `
        <span class="vtx-num">${i}</span>
        <div class="vtx-field">
          <label>X</label>
          <input type="number" class="vtx-x" value="${v.x.toFixed(1)}" step="1" data-idx="${i}">
        </div>
        <div class="vtx-field">
          <label>Y</label>
          <input type="number" class="vtx-y" value="${v.y.toFixed(1)}" step="1" data-idx="${i}">
        </div>
        <span class="vtx-info" title="Distance and angle to next vertex">${distLabel}</span>
        <button class="vtx-remove" data-idx="${i}" title="Remove vertex">&times;</button>
      `;
      container.appendChild(row);
    });

    // Bind events
    container.querySelectorAll('.vtx-x').forEach((el) => {
      el.addEventListener('input', () => {
        const idx = parseInt(el.dataset.idx, 10);
        this.scene.reflector.vertices[idx].x = parseFloat(el.value) || 0;
        this.debounceChange();
      });
    });

    container.querySelectorAll('.vtx-y').forEach((el) => {
      el.addEventListener('input', () => {
        const idx = parseInt(el.dataset.idx, 10);
        this.scene.reflector.vertices[idx].y = parseFloat(el.value) || 0;
        this.debounceChange();
      });
    });

    container.querySelectorAll('.vtx-remove').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        this.scene.reflector.vertices.splice(idx, 1);
        this.renderVertexList();
        this.debounceChange();
      });
    });
  }

  syncFromScene() {
    const bindings = [
      ['exit-center-x', 'exitArea.center.x'],
      ['exit-center-y', 'exitArea.center.y'],
      ['exit-angle', 'exitArea.angleDeg'],
      ['exit-width', 'exitArea.width'],
      ['para-vertex-x', 'reflector.vertex.x'],
      ['para-vertex-y', 'reflector.vertex.y'],
      ['para-focal', 'reflector.focalLength'],
      ['para-aperture', 'reflector.aperture'],
      ['elli-center-x', 'reflector.center.x'],
      ['elli-center-y', 'reflector.center.y'],
      ['elli-major', 'reflector.semiMajor'],
      ['elli-minor', 'reflector.semiMinor'],
    ];
    for (const [id, path] of bindings) {
      const el = document.getElementById(id);
      if (el) {
        const val = this.getPath(path);
        el.value = typeof val === 'number' ? val.toFixed(1) : val;
      }
    }
    this.renderVertexList();
  }

  save() {
    const json = JSON.stringify(this.scene, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reflector-scene.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  load() {
    document.getElementById('file-input')?.click();
  }

  handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { migrateScene } = window.__sceneModule;
        let loaded = JSON.parse(ev.target.result);
        loaded = migrateScene(loaded);
        Object.assign(this.scene, loaded);
        this.init();
        this.onChange();
      } catch (err) {
        alert('Invalid scene file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  reset() {
    const { createDefaultScene } = window.__sceneModule;
    const def = createDefaultScene();
    Object.assign(this.scene, def);
    this.init();
    this.onChange();
  }
}
