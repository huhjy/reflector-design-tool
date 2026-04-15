// Wire HTML controls to scene model
import { computeVertexSegmentInfo } from '../engine/reflector-shapes.js';

export class Controls {
  constructor(scene, onChange, undoMgr = null) {
    this.scene = scene;
    this.onChange = onChange;
    this.undoMgr = undoMgr;
    this._debounceTimer = null;
    this._undoPushed = false;   // one snapshot per focused edit session
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
      if (this.undoMgr) this.undoMgr.push(this.scene);
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
    // Push undo snapshot once per focus session (not on every keystroke)
    const pushOnce = () => {
      if (!this._undoPushed && this.undoMgr) {
        this.undoMgr.push(this.scene);
        this._undoPushed = true;
      }
    };
    el.addEventListener('focus', pushOnce);
    el.addEventListener('mousedown', pushOnce);  // range inputs
    el.addEventListener('blur', () => { this._undoPushed = false; });
    el.addEventListener('mouseup', () => { this._undoPushed = false; });

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
    const isVertexMode = mode === 'polyline' || mode === 'smooth' || mode === 'mixed';
    if (polyEl) polyEl.style.display = isVertexMode ? 'block' : 'none';
    if (bezEl) bezEl.style.display = mode === 'bezier' ? 'block' : 'none';
  }

  renderVertexList() {
    const container = document.getElementById('vertex-list');
    if (!container) return;

    const verts = this.scene.reflector.vertices || [];
    const segInfo = computeVertexSegmentInfo(verts);
    const isMixed = this.scene.reflector.freeformMode === 'mixed';
    const segCurved = this.scene.reflector.segmentCurved || [];
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

      // Segment type toggle between consecutive vertices (mixed mode only)
      if (isMixed && i < verts.length - 1) {
        const curved = !!segCurved[i];
        const tension = (this.scene.reflector.segmentTension || [])[i] ?? 0.5;
        const segRow = document.createElement('div');
        segRow.className = 'seg-type-row';
        segRow.innerHTML = `
          <button class="seg-type-btn${curved ? ' curved' : ''}" data-idx="${i}"
            title="${curved ? 'Curved \u2014 click to make straight' : 'Straight \u2014 click to make curved'}">
            ${curved ? '\u2040' : '\u2014'}
          </button>
          ${curved ? `<input type="range" class="seg-tension" data-idx="${i}"
            min="0.05" max="1.5" step="0.05" value="${tension}"
            title="Curvature tension: ${tension.toFixed(2)} (0 = flat, 0.5 = standard, 1+ = exaggerated)">
            <span class="seg-tension-val">${tension.toFixed(2)}</span>` : ''}
        `;
        container.appendChild(segRow);
      }
    });

    // Bind vertex X/Y input events
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
        if (this.undoMgr) this.undoMgr.push(this.scene);
        const idx = parseInt(el.dataset.idx, 10);
        this.scene.reflector.vertices.splice(idx, 1);
        // Also remove the corresponding segmentCurved entry
        const sc = this.scene.reflector.segmentCurved;
        if (sc && idx < sc.length) sc.splice(idx, 1);
        this.renderVertexList();
        this.debounceChange();
      });
    });

    // Bind segment type toggle events (mixed mode)
    if (isMixed) {
      container.querySelectorAll('.seg-type-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (this.undoMgr) this.undoMgr.push(this.scene);
          const idx = parseInt(btn.dataset.idx, 10);
          const sc = this.scene.reflector.segmentCurved || [];
          while (sc.length < verts.length - 1) sc.push(false);
          sc[idx] = !sc[idx];
          this.scene.reflector.segmentCurved = sc;
          this.renderVertexList();
          this.debounceChange();
        });
      });

      // Bind tension slider events
      container.querySelectorAll('.seg-tension').forEach((slider) => {
        let pushed = false;
        slider.addEventListener('mousedown', () => {
          if (!pushed && this.undoMgr) {
            this.undoMgr.push(this.scene);
            pushed = true;
          }
        });
        slider.addEventListener('mouseup', () => { pushed = false; });
        slider.addEventListener('input', () => {
          const idx = parseInt(slider.dataset.idx, 10);
          const st = this.scene.reflector.segmentTension || [];
          while (st.length < verts.length - 1) st.push(0.5);
          st[idx] = parseFloat(slider.value);
          this.scene.reflector.segmentTension = st;
          // Update display
          const valSpan = slider.nextElementSibling;
          if (valSpan) valSpan.textContent = parseFloat(slider.value).toFixed(2);
          this.debounceChange();
        });
      });
    }
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
