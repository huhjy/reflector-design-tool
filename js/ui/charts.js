// Distribution chart and results display
import { computeEfficiency, computeDistribution, computeAngularDistribution } from '../engine/analysis.js';

export class Charts {
  constructor(chartCanvas, angularCanvas, resultsEl) {
    this.canvas = chartCanvas;
    this.ctx = chartCanvas.getContext('2d');
    this.angularCanvas = angularCanvas;
    this.angularCtx = angularCanvas ? angularCanvas.getContext('2d') : null;
    this.resultsEl = resultsEl;
  }

  update(traceResult, scene) {
    const eff = computeEfficiency(traceResult, scene);
    const dist = computeDistribution(traceResult, 40);
    const angDist = computeAngularDistribution(traceResult, 45);

    this.drawDistribution(dist, scene);
    this.drawAngularDistribution(angDist);
    this.updateResults(eff, dist, angDist);
  }

  drawDistribution(dist, scene) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const padding = { top: 25, bottom: 30, left: 10, right: 10 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = '#888';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Intensity Distribution at Exit', w / 2, 15);

    if (dist.peak <= 0) {
      ctx.fillStyle = '#bbb';
      ctx.font = '12px sans-serif';
      ctx.fillText('No rays hitting exit', w / 2, h / 2);
      return;
    }

    // Bars
    const barW = plotW / dist.bins.length;
    for (let i = 0; i < dist.bins.length; i++) {
      const val = dist.bins[i] / dist.peak;
      const barH = val * plotH;
      const x = padding.left + i * barW;
      const y = padding.top + plotH - barH;

      const r = Math.floor(200 + val * 55);
      const g = Math.floor(140 + val * 40);
      const b = Math.floor(20);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, barW - 1, barH);
    }

    // Axis line
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + plotH);
    ctx.lineTo(padding.left + plotW, padding.top + plotH);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('P1', padding.left, h - 5);
    ctx.textAlign = 'right';
    ctx.fillText('P2', w - padding.right, h - 5);
    ctx.textAlign = 'center';
    ctx.fillText('Position along exit', w / 2, h - 5);
  }

  drawAngularDistribution(angDist) {
    if (!this.angularCanvas || !this.angularCtx) return;
    const ctx = this.angularCtx;
    const w = this.angularCanvas.width;
    const h = this.angularCanvas.height;
    const padding = { top: 25, bottom: 30, left: 10, right: 10 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = '#888';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Angular Distribution at Exit', w / 2, 15);

    if (angDist.peak <= 0) {
      ctx.fillStyle = '#bbb';
      ctx.font = '12px sans-serif';
      ctx.fillText('No exit rays', w / 2, h / 2);
      return;
    }

    const barW = plotW / angDist.bins.length;

    // Highlight the 0-10° target zone
    const minAngle = -90, maxAngle = 90;
    const zoneStart = ((0 - minAngle) / (maxAngle - minAngle)) * plotW;
    const zoneEnd = ((10 - minAngle) / (maxAngle - minAngle)) * plotW;
    ctx.fillStyle = 'rgba(76, 175, 80, 0.10)';
    ctx.fillRect(padding.left + zoneStart, padding.top, zoneEnd - zoneStart, plotH);

    // Bars
    for (let i = 0; i < angDist.bins.length; i++) {
      const val = angDist.bins[i] / angDist.peak;
      const barH = val * plotH;
      const x = padding.left + i * barW;
      const y = padding.top + plotH - barH;

      // Blue gradient
      const r = Math.floor(30 + val * 20);
      const g = Math.floor(100 + val * 50);
      const b = Math.floor(180 + val * 60);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, barW - 1, barH);
    }

    // Axis line
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + plotH);
    ctx.lineTo(padding.left + plotW, padding.top + plotH);
    ctx.stroke();

    // Tick labels at key angles
    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    for (const angle of [-90, -45, 0, 45, 90]) {
      const xPos = padding.left + ((angle - minAngle) / (maxAngle - minAngle)) * plotW;
      ctx.fillText(`${angle}°`, xPos, h - 5);
      // Tick mark
      ctx.beginPath();
      ctx.moveTo(xPos, padding.top + plotH);
      ctx.lineTo(xPos, padding.top + plotH + 3);
      ctx.stroke();
    }

    // Peak angle indicator
    const peakX = padding.left + ((angDist.peakAngle - minAngle) / (maxAngle - minAngle)) * plotW;
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(peakX, padding.top);
    ctx.lineTo(peakX, padding.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#e53935';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = peakX > w / 2 ? 'right' : 'left';
    ctx.fillText(`peak ${angDist.peakAngle.toFixed(0)}°`, peakX + (peakX > w / 2 ? -3 : 3), padding.top + 10);
  }

  updateResults(eff, dist, angDist) {
    this.resultsEl.innerHTML = `
      <div class="result-row" title="What percentage of emitted rays successfully reach the exit aperture. Higher = less wasted light.">
        <span class="result-label">Ray Efficiency <span class="info-tip">?</span></span>
        <span class="result-value ${eff.rayEfficiency > 50 ? 'good' : eff.rayEfficiency > 20 ? 'ok' : 'poor'}">${eff.rayEfficiency.toFixed(1)}%</span>
      </div>
      <div class="result-row" title="Like ray efficiency, but weighted by each ray's brightness. Accounts for reflection losses and the LED intensity profile.">
        <span class="result-label">Power Efficiency <span class="info-tip">?</span></span>
        <span class="result-value ${eff.intensityEfficiency > 50 ? 'good' : eff.intensityEfficiency > 20 ? 'ok' : 'poor'}">${eff.intensityEfficiency.toFixed(1)}%</span>
      </div>
      <div class="result-row" title="Raw count of rays reaching the exit out of the total simulated.">
        <span class="result-label">Rays Hit / Total</span>
        <span class="result-value">${eff.hitCount} / ${eff.totalRays}</span>
      </div>
      <div class="result-row" title="How evenly light is spread across the exit aperture. 100% = perfectly uniform, 0% = all light in one spot.">
        <span class="result-label">Uniformity <span class="info-tip">?</span></span>
        <span class="result-value">${(dist.uniformity * 100).toFixed(1)}%</span>
      </div>
      <div class="result-row" title="Full Width at Half Maximum of the spatial distribution — the portion of the exit aperture receiving ≥ half peak intensity.">
        <span class="result-label">FWHM (spatial) <span class="info-tip">?</span></span>
        <span class="result-value">${dist.fwhm.toFixed(1)}%</span>
      </div>
      <div class="result-row" title="Direction where exit rays are most concentrated. 0° = horizontal right, 90° = straight up, -90° = straight down.">
        <span class="result-label">Peak Angle <span class="info-tip">?</span></span>
        <span class="result-value">${angDist.peakAngle.toFixed(1)}°</span>
      </div>
      <div class="result-row" title="Angular Full Width at Half Maximum — the spread of the exit beam in degrees. Smaller = more collimated beam.">
        <span class="result-label">Beam Width <span class="info-tip">?</span></span>
        <span class="result-value">${angDist.fwhm.toFixed(1)}°</span>
      </div>
    `;
  }
}
