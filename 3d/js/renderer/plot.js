// Simple 2D canvas bar chart of the exit beam's angular distribution
// (flux vs. angle from the exit-face normal).

const AXIS_COLOR = '#94a3b8';
const BAR_COLOR = '#16a34a';
const TEXT_COLOR = '#334155';

export function drawAngularPlot(canvas, angle) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const padding = { left: 6, right: 6, top: 6, bottom: 16 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const baseline = padding.top + plotHeight;

  const peak = Math.max(...angle.bins, 0);
  ctx.fillStyle = BAR_COLOR;
  if (peak > 0) {
    const barWidth = plotWidth / angle.bins.length;
    for (let i = 0; i < angle.bins.length; i++) {
      const barHeight = (angle.bins[i] / peak) * plotHeight;
      ctx.fillRect(padding.left + i * barWidth, baseline - barHeight, Math.max(1, barWidth - 1), barHeight);
    }
  }

  ctx.strokeStyle = AXIS_COLOR;
  ctx.beginPath();
  ctx.moveTo(padding.left, baseline);
  ctx.lineTo(padding.left + plotWidth, baseline);
  ctx.stroke();

  const maxAngle = angle.binCenters.length ? Math.round(angle.binCenters.at(-1) + angle.binWidth / 2) : 90;
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('0°', padding.left, height - 4);
  ctx.fillText(`${maxAngle}° from exit normal`, padding.left + plotWidth - 96, height - 4);
}
