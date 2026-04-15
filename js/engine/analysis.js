// Efficiency and distribution analysis

/**
 * Compute efficiency metrics.
 */
export function computeEfficiency(traceResult, scene) {
  const total = traceResult.rays.length;
  const hitCount = traceResult.exitHits.length;

  const totalEmitted = traceResult.rays.reduce((sum, r) => sum + r.intensity, 0);
  const totalCaptured = traceResult.exitHits.reduce((sum, h) => sum + h.intensity, 0);

  return {
    rayEfficiency: total > 0 ? (hitCount / total) * 100 : 0,
    intensityEfficiency: totalEmitted > 0 ? (totalCaptured / totalEmitted) * 100 : 0,
    hitCount,
    totalRays: total,
  };
}

/**
 * Compute angular distribution of exit rays.
 * Bins exit ray directions by angle from horizontal.
 * Returns { bins, binCenters (degrees), peak, peakAngle, fwhm (degrees) }.
 */
export function computeAngularDistribution(traceResult, binCount = 45) {
  const minAngle = -90;
  const maxAngle = 90;
  const range = maxAngle - minAngle;
  const binWidth = range / binCount;
  const bins = new Array(binCount).fill(0);
  const binCenters = [];
  for (let i = 0; i < binCount; i++) {
    binCenters.push(minAngle + (i + 0.5) * binWidth);
  }

  for (const ray of traceResult.rays) {
    if (!ray.hitExit || !ray.exitDirection) continue;
    const angleDeg = Math.atan2(ray.exitDirection.y, ray.exitDirection.x) * 180 / Math.PI;
    const idx = Math.floor((angleDeg - minAngle) / binWidth);
    if (idx >= 0 && idx < binCount) {
      bins[idx] += ray.finalIntensity;
    }
  }

  const peak = Math.max(...bins, 0.001);
  let peakIdx = 0;
  for (let i = 0; i < binCount; i++) {
    if (bins[i] > bins[peakIdx]) peakIdx = i;
  }
  const peakAngle = binCenters[peakIdx];

  // FWHM in degrees
  const halfMax = peak / 2;
  let fwhmStart = 0, fwhmEnd = binCount - 1;
  for (let i = 0; i < binCount; i++) {
    if (bins[i] >= halfMax) { fwhmStart = i; break; }
  }
  for (let i = binCount - 1; i >= 0; i--) {
    if (bins[i] >= halfMax) { fwhmEnd = i; break; }
  }
  const fwhm = (fwhmEnd - fwhmStart + 1) * binWidth;

  return { bins, binCenters, peak, peakAngle, fwhm, binWidth };
}

/**
 * Compute intensity distribution along exit area.
 */
export function computeDistribution(traceResult, binCount = 30) {
  const bins = new Array(binCount).fill(0);
  const binEdges = [];

  for (let i = 0; i <= binCount; i++) {
    binEdges.push(i / binCount);
  }

  for (const hit of traceResult.exitHits) {
    const binIdx = Math.min(Math.floor(hit.position * binCount), binCount - 1);
    bins[binIdx] += hit.intensity;
  }

  const peak = Math.max(...bins, 0.001);
  const nonZero = bins.filter(b => b > 0);
  const uniformity = nonZero.length > 1 ? Math.min(...nonZero) / Math.max(...nonZero) : 0;

  // FWHM: full width at half maximum
  const halfMax = peak / 2;
  let fwhmStart = 0, fwhmEnd = binCount - 1;
  for (let i = 0; i < binCount; i++) {
    if (bins[i] >= halfMax) { fwhmStart = i; break; }
  }
  for (let i = binCount - 1; i >= 0; i--) {
    if (bins[i] >= halfMax) { fwhmEnd = i; break; }
  }
  const fwhm = ((fwhmEnd - fwhmStart + 1) / binCount) * 100;

  return { bins, binEdges, peak, uniformity, fwhm };
}
