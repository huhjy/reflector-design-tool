// Color palette for the renderer

export const COLORS = {
  background: '#f0f0f0',
  grid: '#ddd',
  gridMajor: '#ccc',
  reflector: '#1565C0',       // bold blue like reference
  reflectorStroke: '#1565C0',
  exitArea: '#66bb6a',
  exitAreaGlow: 'rgba(102, 187, 106, 0.3)',
  lightSource: '#fff9c4',
  lightSourceGlow: 'rgba(255, 249, 196, 0.5)',
  pcb: '#2e7d32',             // dark green
  pcbLed: '#FFB300',          // amber LED
  emissionCone: 'rgba(255, 200, 0, 0.06)',
  handle: '#ff7043',
  handleHover: '#ffab91',
  controlPoint: '#ce93d8',
  controlLine: 'rgba(206, 147, 216, 0.4)',
  text: '#333',
  textDim: '#888',
};

/**
 * Map ray intensity to color.
 * Hit rays are warm yellow/orange, missed rays are faint orange.
 */
export function rayColor(intensity, hitExit, alpha = 1) {
  if (hitExit) {
    const a = Math.max(0.15, Math.min(0.85, intensity * 0.7)) * alpha;
    return `rgba(255, 180, 0, ${a})`;
  } else {
    const a = Math.max(0.06, Math.min(0.35, intensity * 0.25)) * alpha;
    return `rgba(230, 160, 30, ${a})`;
  }
}
