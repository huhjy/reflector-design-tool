// Scene data model - pure data, no rendering or simulation logic

export function createDefaultScene() {
  return {
    lightSource: {
      position: { x: 0, y: 0 },
      ledWidth: 1.6,
      ledHeight: 0.78,
      emissionAngleMin: -67.5,
      emissionAngleMax: 67.5,
      intensityProfile: 'lambertian',
      rayCount: 150,
    },
    exitArea: {
      center: { x: 3.24, y: 4.7 },
      angleDeg: -56.5,
      width: 7.8,
    },
    reflector: {
      type: 'freeform',
      // Parabolic
      vertex: { x: 0, y: -8 },
      focalLength: 8,
      aperture: 110,
      // Elliptical
      center: { x: 0, y: 30 },
      semiMajor: 55,
      semiMinor: 45,
      rotation: 0,
      arcStartDeg: 180,
      arcEndDeg: 360,
      // Freeform
      freeformMode: 'mixed', // 'polyline' | 'smooth' | 'mixed' | 'bezier'
      // Polyline vertices (absolute positions, independent)
      vertices: [
        { x: -2.85, y: -1.05 },  // near PCB, left of LED
        { x: -1.93, y: 4.49 },   // vertical wall above
        { x: 1.44, y: 8.46 },    // sweeping forward & up
        { x: 1.08, y: 11.11 },   // upper tip, curves back to aim beam down
      ],
      segmentCurved: [true, true, true],      // all curved for smooth collimation
      segmentTension: [0.14, 0.52, 0.63],     // optimized curvature per segment
      // Bezier control points
      controlPoints: [
        { x: -55, y: 75 },
        { x: -60, y: 40 },
        { x: -50, y: 10 },
        { x: -15, y: 0 },
        { x: 15, y: 0 },
        { x: 50, y: 10 },
        { x: 60, y: 40 },
        { x: 55, y: 75 },
      ],
      mirrorX: false,
      reflectivity: 0.95,
      surfaceType: 'specular',
    },
    pcb: {
      y: 0,
      width: 20,
      height: 1.5,
    },
  };
}

/**
 * Derive exit area endpoints from center + angle + width.
 */
export function getExitEndpoints(exitArea) {
  const halfW = exitArea.width / 2;
  const rad = (exitArea.angleDeg * Math.PI) / 180;
  const dx = halfW * Math.cos(rad);
  const dy = halfW * Math.sin(rad);
  return {
    p1: { x: exitArea.center.x - dx, y: exitArea.center.y - dy },
    p2: { x: exitArea.center.x + dx, y: exitArea.center.y + dy },
  };
}

/**
 * Distance from LED to exit center.
 */
export function getLedToExitDistance(scene) {
  const dx = scene.exitArea.center.x - scene.lightSource.position.x;
  const dy = scene.exitArea.center.y - scene.lightSource.position.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Migrate old scene format (chained segments) to new (absolute vertices).
 */
export function migrateScene(scene) {
  const r = scene.reflector;
  if (r.segmentStart && r.segments && !r.vertices) {
    const verts = [{ x: r.segmentStart.x, y: r.segmentStart.y }];
    let cx = r.segmentStart.x, cy = r.segmentStart.y;
    for (const seg of r.segments) {
      const rad = (seg.angleDeg * Math.PI) / 180;
      cx += seg.length * Math.cos(rad);
      cy += seg.length * Math.sin(rad);
      verts.push({ x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10 });
    }
    r.vertices = verts;
    r.freeformMode = 'polyline';
  }
  // Handle old 'segments' mode name
  if (r.freeformMode === 'segments') {
    r.freeformMode = 'polyline';
  }
  return scene;
}

export function cloneScene(scene) {
  return structuredClone(scene);
}

export function sceneToJSON(scene) {
  return JSON.stringify(scene, null, 2);
}

export function sceneFromJSON(json) {
  return JSON.parse(json);
}
