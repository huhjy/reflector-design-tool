// Main canvas renderer
import { COLORS, rayColor } from './colors.js';
import { getReflectorSamplePoints, computeVertexSegmentInfo } from '../engine/reflector-shapes.js';
import { getExitEndpoints, getLedToExitDistance } from '../scene.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scene = null;
    this.traceResult = null;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 4.5;
    this.hoveredHandle = null;
    this.showRays = true;
    this.showDimensions = true;
  }

  setScene(scene) { this.scene = scene; }
  setTraceResult(result) { this.traceResult = result; }

  toScreen(wx, wy) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height * 0.78;
    return {
      x: cx + (wx + this.offsetX) * this.scale,
      y: cy - (wy + this.offsetY) * this.scale,
    };
  }

  toWorld(sx, sy) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height * 0.78;
    return {
      x: (sx - cx) / this.scale - this.offsetX,
      y: -(sy - cy) / this.scale - this.offsetY,
    };
  }

  render() {
    const { ctx, canvas, scene } = this;
    if (!scene) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.drawBackground();
    this.drawGrid();
    this.drawPCB();
    if (this.traceResult && this.showRays) {
      this.drawRays();
      this.drawExitRays();
    }
    this.drawReflector();
    if (this.showDimensions) this.drawReflectorDimensions();
    this.drawExitArea();
    this.drawLED();
    this.drawLedToExitDimension();
    this.drawHandles();
    this.drawScale();
  }

  drawBackground() {
    this.ctx.fillStyle = COLORS.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawGrid() {
    const { ctx, canvas } = this;
    const topLeft = this.toWorld(0, 0);
    const bottomRight = this.toWorld(canvas.width, canvas.height);
    let spacing = 10;
    const pixelSpacing = spacing * this.scale;
    if (pixelSpacing < 15) spacing = 50;
    else if (pixelSpacing < 30) spacing = 20;
    else if (pixelSpacing > 200) spacing = 5;

    const startX = Math.floor(topLeft.x / spacing) * spacing;
    const endX = Math.ceil(bottomRight.x / spacing) * spacing;
    const startY = Math.floor(bottomRight.y / spacing) * spacing;
    const endY = Math.ceil(topLeft.y / spacing) * spacing;

    ctx.lineWidth = 0.5;
    for (let x = startX; x <= endX; x += spacing) {
      const s = this.toScreen(x, 0);
      ctx.strokeStyle = x === 0 ? COLORS.gridMajor : COLORS.grid;
      ctx.globalAlpha = x === 0 ? 0.6 : 0.4;
      ctx.beginPath();
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, canvas.height);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += spacing) {
      const s = this.toScreen(0, y);
      ctx.strokeStyle = y === 0 ? COLORS.gridMajor : COLORS.grid;
      ctx.globalAlpha = y === 0 ? 0.6 : 0.4;
      ctx.beginPath();
      ctx.moveTo(0, s.y);
      ctx.lineTo(canvas.width, s.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawPCB() {
    const { ctx, scene } = this;
    const pcb = scene.pcb;
    const left = this.toScreen(-pcb.width / 2, pcb.y);
    const right = this.toScreen(pcb.width / 2, pcb.y - pcb.height);
    ctx.fillStyle = COLORS.pcb;
    ctx.fillRect(left.x, left.y, right.x - left.x, right.y - left.y);
    ctx.strokeStyle = '#43a047';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, left.y);
    ctx.stroke();
  }

  drawLED() {
    const { ctx, scene } = this;
    const ls = scene.lightSource;
    const ledW = (ls.ledWidth || 1.6) * this.scale;
    const ledH = (ls.ledHeight || 0.78) * this.scale;
    const minW = Math.max(ledW, 6);
    const minH = Math.max(ledH, 3);
    const ledBase = this.toScreen(ls.position.x, ls.position.y);

    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(ledBase.x - minW / 2 - 1, ledBase.y - minH - 1, minW + 2, minH + 1);
    ctx.fillStyle = COLORS.pcbLed;
    ctx.fillRect(ledBase.x - minW / 2, ledBase.y - minH, minW, minH);
    ctx.fillStyle = '#FFF176';
    const emitH = Math.max(minH * 0.25, 2);
    ctx.fillRect(ledBase.x - minW / 2, ledBase.y - minH, minW, emitH);

    const glowR = Math.max(minW * 2, 15);
    const gradient = ctx.createRadialGradient(ledBase.x, ledBase.y - minH / 2, 0, ledBase.x, ledBase.y - minH / 2, glowR);
    gradient.addColorStop(0, 'rgba(255, 240, 100, 0.35)');
    gradient.addColorStop(1, 'rgba(255, 240, 100, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ledBase.x, ledBase.y - minH / 2, glowR, 0, Math.PI * 2);
    ctx.fill();

    if (this.scale > 5) {
      ctx.fillStyle = '#999';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${ls.ledWidth}\u00D7${ls.ledHeight}mm`, ledBase.x, ledBase.y + 12);
    }
  }

  drawRays() {
    const { ctx } = this;
    for (const ray of this.traceResult.rays) {
      if (ray.points.length < 2) continue;
      ctx.strokeStyle = rayColor(ray.intensity, ray.hitExit);
      ctx.lineWidth = ray.hitExit ? 1.5 : 0.7;
      ctx.beginPath();
      const start = this.toScreen(ray.points[0].x, ray.points[0].y);
      ctx.moveTo(start.x, start.y);
      for (let i = 1; i < ray.points.length; i++) {
        const p = this.toScreen(ray.points[i].x, ray.points[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  drawExitRays() {
    const { ctx } = this;
    const extLen = 120;
    ctx.setLineDash([3, 5]);
    for (const ray of this.traceResult.rays) {
      if (!ray.hitExit || !ray.exitPoint || !ray.exitDirection) continue;
      const from = this.toScreen(ray.exitPoint.x, ray.exitPoint.y);
      const to = this.toScreen(
        ray.exitPoint.x + ray.exitDirection.x * extLen,
        ray.exitPoint.y + ray.exitDirection.y * extLen
      );
      ctx.strokeStyle = rayColor(ray.finalIntensity, true, 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  drawReflector() {
    const { ctx, scene } = this;
    const r = scene.reflector;
    const points = getReflectorSamplePoints(r);
    if (points.length < 2) return;

    ctx.strokeStyle = COLORS.reflectorStroke;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const first = this.toScreen(points[0].x, points[0].y);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
      const p = this.toScreen(points[i].x, points[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#42A5F5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
      const p = this.toScreen(points[i].x, points[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Bezier control lines
    if (r.type === 'freeform' && r.freeformMode === 'bezier') {
      ctx.strokeStyle = COLORS.controlLine;
      ctx.lineWidth = 1;
      for (let i = 0; i < r.controlPoints.length - 1; i++) {
        const a = this.toScreen(r.controlPoints[i].x, r.controlPoints[i].y);
        const b = this.toScreen(r.controlPoints[i + 1].x, r.controlPoints[i + 1].y);
        if (i % 3 !== 0 || i === 0) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }

  /** Draw CAD-style dimension lines between reflector vertices */
  drawReflectorDimensions() {
    const { ctx, scene } = this;
    const r = scene.reflector;
    if (r.type !== 'freeform' || r.freeformMode !== 'polyline') return;
    if (!r.vertices || r.vertices.length < 2) return;
    if (this.scale < 1.5) return; // too zoomed out

    const segInfo = computeVertexSegmentInfo(r.vertices);

    for (let i = 0; i < r.vertices.length - 1; i++) {
      const a = r.vertices[i];
      const b = r.vertices[i + 1];
      const sa = this.toScreen(a.x, a.y);
      const sb = this.toScreen(b.x, b.y);

      // Offset perpendicular to segment for dimension line
      const dx = sb.x - sa.x;
      const dy = sb.y - sa.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 20) continue; // too short to label

      const nx = -dy / len * 14; // 14px offset
      const ny = dx / len * 14;

      const oa = { x: sa.x + nx, y: sa.y + ny };
      const ob = { x: sb.x + nx, y: sb.y + ny };
      const mid = { x: (oa.x + ob.x) / 2, y: (oa.y + ob.y) / 2 };

      // Dimension line
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(oa.x, oa.y);
      ctx.lineTo(ob.x, ob.y);
      ctx.stroke();

      // Tick marks
      const tickLen = 4;
      const tx = dx / len * tickLen;
      const ty = dy / len * tickLen;
      for (const p of [oa, ob]) {
        ctx.beginPath();
        ctx.moveTo(p.x - tx, p.y - ty);
        ctx.lineTo(p.x + tx, p.y + ty);
        ctx.stroke();
      }

      // Extension lines back to vertices
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(oa.x, oa.y);
      ctx.moveTo(sb.x, sb.y);
      ctx.lineTo(ob.x, ob.y);
      ctx.stroke();

      // Label
      const info = segInfo[i];
      ctx.fillStyle = 'rgba(80, 80, 80, 0.7)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${info.length.toFixed(1)}mm`, mid.x, mid.y);
    }
  }

  drawExitArea() {
    const { ctx, scene } = this;
    const { p1, p2 } = getExitEndpoints(scene.exitArea);
    const sp1 = this.toScreen(p1.x, p1.y);
    const sp2 = this.toScreen(p2.x, p2.y);
    const sc = this.toScreen(scene.exitArea.center.x, scene.exitArea.center.y);

    // Glow
    ctx.strokeStyle = COLORS.exitAreaGlow;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(sp1.x, sp1.y);
    ctx.lineTo(sp2.x, sp2.y);
    ctx.stroke();

    // Main dashed line
    ctx.strokeStyle = COLORS.exitArea;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(sp1.x, sp1.y);
    ctx.lineTo(sp2.x, sp2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Width dimension label
    ctx.fillStyle = 'rgba(102, 187, 106, 0.8)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const mid = { x: (sp1.x + sp2.x) / 2, y: (sp1.y + sp2.y) / 2 };
    ctx.fillText(`${scene.exitArea.width.toFixed(0)}mm`, mid.x, mid.y - 16);
    ctx.fillText('EXIT APERTURE', mid.x, mid.y - 28);

    // Normal direction indicator
    const angleRad = (scene.exitArea.angleDeg * Math.PI) / 180;
    const normalWorldLen = 12;
    const nEnd = this.toScreen(
      scene.exitArea.center.x - Math.sin(angleRad) * normalWorldLen,
      scene.exitArea.center.y + Math.cos(angleRad) * normalWorldLen
    );
    ctx.strokeStyle = 'rgba(102, 187, 106, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sc.x, sc.y);
    ctx.lineTo(nEnd.x, nEnd.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rotation handle indicator (small arc)
    const rotHandlePos = this._getExitRotateHandlePos();
    if (rotHandlePos) {
      const rs = this.toScreen(rotHandlePos.x, rotHandlePos.y);
      ctx.strokeStyle = 'rgba(102, 187, 106, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rs.x, rs.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Draw CAD dimension line from LED to exit center */
  drawLedToExitDimension() {
    const { ctx, scene } = this;
    const led = this.toScreen(scene.lightSource.position.x, scene.lightSource.position.y);
    const exit = this.toScreen(scene.exitArea.center.x, scene.exitArea.center.y);
    const dist = getLedToExitDistance(scene);

    // Offset to the side
    const dx = exit.x - led.x;
    const dy = exit.y - led.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 10) return;

    const offset = 25; // px to the right
    const nx = -dy / len * offset;
    const ny = dx / len * offset;

    const a = { x: led.x + nx, y: led.y + ny };
    const b = { x: exit.x + nx, y: exit.y + ny };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    // Dimension line
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Tick marks
    const tickLen = 4;
    const tx = dx / len * tickLen;
    const ty = dy / len * tickLen;
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.moveTo(p.x - tx, p.y - ty);
      ctx.lineTo(p.x + tx, p.y + ty);
      ctx.stroke();
    }

    // Extension lines
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.25)';
    ctx.beginPath();
    ctx.moveTo(led.x, led.y);
    ctx.lineTo(a.x, a.y);
    ctx.moveTo(exit.x, exit.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Label
    ctx.save();
    ctx.translate(mid.x, mid.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${dist.toFixed(1)}mm`, 0, -3);
    ctx.restore();
  }

  drawScale() {
    const { ctx, canvas } = this;
    const barWorldLen = 10;
    const barPixelLen = barWorldLen * this.scale;
    const x = 20;
    const y = canvas.height - 20;
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + barPixelLen, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x + barPixelLen, y - 4);
    ctx.lineTo(x + barPixelLen, y + 4);
    ctx.stroke();
    ctx.fillStyle = '#999';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${barWorldLen} mm`, x + barPixelLen / 2, y - 8);
  }

  drawHandles() {
    const { ctx } = this;
    const handles = this.getHandles();

    for (const h of handles) {
      const s = this.toScreen(h.x, h.y);
      const isHovered = this.hoveredHandle && this.hoveredHandle.id === h.id;
      const color = h.color || COLORS.handle;
      const radius = isHovered ? 8 : 5;

      if (h.shape === 'square') {
        // Width handles
        const sz = isHovered ? 9 : 6;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x - sz, s.y - sz, sz * 2, sz * 2);
        ctx.fillStyle = isHovered ? color : 'rgba(255,255,255,0.9)';
        ctx.fillRect(s.x - sz + 1, s.y - sz + 1, sz * 2 - 2, sz * 2 - 2);
      } else if (h.shape === 'diamond') {
        // Rotation handle
        const sz = isHovered ? 7 : 5;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
        ctx.fillStyle = isHovered ? color : 'rgba(255,255,255,0.9)';
        ctx.fillRect(-sz / 2 + 1, -sz / 2 + 1, sz - 2, sz - 2);
        ctx.restore();
      } else {
        // Default circle
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = isHovered ? color : 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, radius - 1, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isHovered) {
        ctx.fillStyle = '#333';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(h.label, s.x, s.y - 14);
        ctx.font = '10px monospace';
        ctx.fillText(`(${h.x.toFixed(1)}, ${h.y.toFixed(1)})`, s.x, s.y + 20);
      }
    }
  }

  _getExitRotateHandlePos() {
    const ea = this.scene.exitArea;
    const angleRad = (ea.angleDeg * Math.PI) / 180;
    const offset = 18; // world units along normal
    return {
      x: ea.center.x - Math.sin(angleRad) * offset,
      y: ea.center.y + Math.cos(angleRad) * offset,
    };
  }

  getHandles() {
    const { scene } = this;
    if (!scene) return [];
    const handles = [];

    // Exit handles: center (circle), P1/P2 endpoints (squares for width), rotate (diamond)
    const { p1, p2 } = getExitEndpoints(scene.exitArea);
    handles.push({
      id: 'exit-center',
      x: scene.exitArea.center.x,
      y: scene.exitArea.center.y,
      label: 'Exit Center',
      color: COLORS.exitArea,
    });
    handles.push({
      id: 'exit-p1',
      x: p1.x, y: p1.y,
      label: 'Width',
      color: COLORS.exitArea,
      shape: 'square',
    });
    handles.push({
      id: 'exit-p2',
      x: p2.x, y: p2.y,
      label: 'Width',
      color: COLORS.exitArea,
      shape: 'square',
    });
    const rotPos = this._getExitRotateHandlePos();
    handles.push({
      id: 'exit-rotate',
      x: rotPos.x, y: rotPos.y,
      label: 'Rotate',
      color: COLORS.exitArea,
      shape: 'diamond',
    });

    // Reflector handles
    const r = scene.reflector;
    if (r.type === 'parabolic') {
      handles.push({
        id: 'reflector-vertex',
        x: r.vertex.x, y: r.vertex.y,
        label: 'Vertex',
        color: COLORS.reflector,
      });
    } else if (r.type === 'elliptical') {
      handles.push({
        id: 'reflector-center',
        x: r.center.x, y: r.center.y,
        label: 'Center',
        color: COLORS.reflector,
      });
    } else if (r.type === 'freeform') {
      if (r.freeformMode === 'polyline' || r.freeformMode === 'smooth' || r.freeformMode === 'mixed') {
        for (let i = 0; i < (r.vertices || []).length; i++) {
          handles.push({
            id: `vtx-${i}`,
            x: r.vertices[i].x,
            y: r.vertices[i].y,
            label: `V${i}`,
            color: COLORS.handle,
          });
        }
      } else {
        // bezier mode
        for (let i = 0; i < r.controlPoints.length; i++) {
          handles.push({
            id: `cp-${i}`,
            x: r.controlPoints[i].x,
            y: r.controlPoints[i].y,
            label: `CP ${i}`,
            color: COLORS.controlPoint,
          });
        }
      }
    }

    return handles;
  }

  hitTestHandle(sx, sy, tolerance = 14) {
    const handles = this.getHandles();
    for (const h of handles) {
      const s = this.toScreen(h.x, h.y);
      const dx = sx - s.x;
      const dy = sy - s.y;
      if (dx * dx + dy * dy < tolerance * tolerance) {
        return h;
      }
    }

    // Also detect clicks on the exit aperture line body itself (for moving)
    if (this.scene) {
      const { p1, p2 } = getExitEndpoints(this.scene.exitArea);
      const sp1 = this.toScreen(p1.x, p1.y);
      const sp2 = this.toScreen(p2.x, p2.y);
      if (this._pointToSegmentDist(sx, sy, sp1.x, sp1.y, sp2.x, sp2.y) < 8) {
        return {
          id: 'exit-line',
          x: this.scene.exitArea.center.x,
          y: this.scene.exitArea.center.y,
          label: 'Move Exit',
          color: COLORS.exitArea,
        };
      }
    }

    return null;
  }

  _pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.sqrt((px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2);
  }
}
