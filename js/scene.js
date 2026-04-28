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
      // Tilted aperture (angle −64°), width 7.44, center at (3.31, 5.5).
      // Sum |V0.x| + exitCx = 5.95 ∈ [5.5, 6] per spec.
      center: { x: 3.3112, y: 5.5 },
      angleDeg: -64,
      width: 7.44,
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
      // Freeform — 15-vertex all-straight "jagged" facet design.
      // Each facet independently aims a slice of LED emission into the [−10°, 0°] window.
      // Performance: peak −4.5°, FWHM 6°, ~97% power efficiency,
      // 42.1% of LED flux in [−10°, 0°] window (up from 37.7% for smooth curve).
      freeformMode: 'mixed', // 'polyline' | 'smooth' | 'mixed' | 'bezier'
      // Polyline vertices (absolute positions, independent).
      // V0 on PCB left of LED; V1 directly above V0 (straight vertical wall);
      // V2 within 3 mm of V1 (+x, +y); final = exit aperture top endpoint.
      vertices: [
        { x: -2.6412, y: 0.0000 },  // V0 — base on PCB, left of LED
        { x: -2.6412, y: 3.2358 },  // V1 — directly above V0 (vertical wall)
        { x: -2.3374, y: 3.7771 },  // V2 — within 3 mm of V1 (+x, +y)
        { x: -2.0365, y: 4.2275 },  // V3 — facet
        { x: -1.6882, y: 4.6997 },  // V4 — facet
        { x: -1.3682, y: 5.1072 },  // V5 — facet
        { x: -0.9670, y: 5.5797 },  // V6 — facet
        { x: -0.4634, y: 6.0978 },  // V7 — facet (apex of left wall curvature)
        { x: -0.5283, y: 6.5310 },  // V8 — facet (slight inward kink)
        { x: -0.5340, y: 6.9336 },  // V9 — facet
        { x: -0.0683, y: 7.3992 },  // V10 — facet
        { x:  0.3437, y: 7.7591 },  // V11 — facet
        { x:  0.7762, y: 8.1213 },  // V12 — facet
        { x:  1.2099, y: 8.4822 },  // V13 — facet
        { x:  1.6804, y: 8.8435 },  // V14 — equals exit aperture top endpoint
      ],
      segmentCurved: [false, false, false, false, false, false, false, false, false, false, false, false, false, false],
      segmentTension: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
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
