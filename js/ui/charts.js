// Distribution chart and results display
import { computeEfficiency, computeDistribution } from '../engine/analysis.js';

export class Charts {
  constructor(chartCanvas, resultsEl) {
    this.canvas = chartCanvas;
    this.ctx = chartCanvas.getContext('2d');
    this.resultsEl = resultsEl;
  }

  update(traceResult, scene) {
    const eff = computeEfficiency(traceResult, scene);
    const dist = computeDistribution(traceResult, 40);

    this.drawDistribution(dist, scene);
    this.updateResults(eff, dist);
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

      // Gradient from amber to deep orange based on value
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

  updateResults(eff, dist) {
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
      <div class="result-row" title="How evenly light is spread across the exit aperture. 100% = perfectly uniform illumination, 0% = all light concentrated in one spot.">
        <span class="result-label">Uniformity <span class="info-tip">?</span></span>
        <span class="result-value">${(dist.uniformity * 100).toFixed(1)}%</span>
      </div>
      <div class="result-row" title="Full Width at Half Maximum — the portion of the exit aperture receiving at least half the peak intensity. Smaller = more concentrated beam, larger = wider spread.">
        <span class="result-label">FWHM <span class="info-tip">?</span></span>
        <span class="result-value">${dist.fwhm.toFixed(1)}%</span>
      </div>
    `;
  }
}
