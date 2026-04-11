// Core ray tracing loop
import { createRay, MAX_BOUNCES, normalize } from './ray.js';
import {
  rayLineSegment,
  rayParabola,
  rayEllipse,
  rayCubicBezier,
  reflectDirection,
  diffuseDirection,
} from './intersect.js';
import { getFreeformBezierSegments, getFreeformSegmentLineSegments } from './reflector-shapes.js';
import { getExitEndpoints } from '../scene.js';

/**
 * Trace all rays through the scene.
 * Returns { rays, exitHits }
 */
export function traceScene(scene) {
  const { lightSource, exitArea, reflector } = scene;
  const rays = [];
  const exitHits = [];

  const { p1: exitP1, p2: exitP2 } = getExitEndpoints(exitArea);

  const minAngle = (lightSource.emissionAngleMin * Math.PI) / 180;
  const maxAngle = (lightSource.emissionAngleMax * Math.PI) / 180;
  const count = lightSource.rayCount;

  for (let i = 0; i < count; i++) {
    const frac = count === 1 ? 0.5 : i / (count - 1);
    const angle = minAngle + frac * (maxAngle - minAngle);

    let intensity;
    switch (lightSource.intensityProfile) {
      case 'uniform':
        intensity = 1;
        break;
      case 'cosine':
        intensity = Math.cos(angle) * Math.cos(angle);
        break;
      case 'lambertian':
      default:
        intensity = Math.cos(angle);
        break;
    }
    intensity = Math.max(0, intensity);

    const ray = createRay(lightSource.position, angle, intensity);
    const traced = traceRay(ray, scene, exitP1, exitP2);
    rays.push(traced);

    if (traced.hitExit) {
      exitHits.push({
        position: traced.exitParam,
        intensity: traced.finalIntensity,
      });
    }
  }

  return { rays, exitHits };
}

function traceRay(initialRay, scene, exitP1, exitP2) {
  const { reflector } = scene;
  const points = [{ x: initialRay.origin.x, y: initialRay.origin.y }];
  let ray = { ...initialRay };
  let intensity = initialRay.intensity;
  let hitExit = false;
  let exitParam = 0;
  let exitPoint = null;
  let exitDirection = null;

  for (let bounce = 0; bounce <= MAX_BOUNCES; bounce++) {
    let closest = null;

    // Test exit area
    const exitHit = rayLineSegment(ray, exitP1, exitP2);
    if (exitHit && (!closest || exitHit.t < closest.t)) {
      closest = { ...exitHit, type: 'exit' };
    }

    // Test reflector
    const reflectorHits = getReflectorHits(ray, reflector);
    for (const hit of reflectorHits) {
      if (!closest || hit.t < closest.t) {
        closest = { ...hit, type: 'reflector' };
      }
    }

    if (!closest) {
      // Ray escapes
      points.push({
        x: ray.origin.x + ray.direction.x * 200,
        y: ray.origin.y + ray.direction.y * 200,
      });
      break;
    }

    points.push({ x: closest.point.x, y: closest.point.y });

    if (closest.type === 'exit') {
      hitExit = true;
      exitParam = closest.param;
      exitPoint = { x: closest.point.x, y: closest.point.y };
      exitDirection = { x: ray.direction.x, y: ray.direction.y };
      break;
    }

    // Reflect
    intensity *= reflector.reflectivity;
    if (intensity < 0.001) break;

    let newDir;
    if (reflector.surfaceType === 'diffuse') {
      newDir = diffuseDirection(closest.normal);
    } else {
      newDir = reflectDirection(ray.direction, closest.normal);
    }

    ray = {
      origin: {
        x: closest.point.x + newDir.x * 0.01,
        y: closest.point.y + newDir.y * 0.01,
      },
      direction: newDir,
      intensity,
      bounces: bounce + 1,
    };
  }

  return {
    points,
    intensity: initialRay.intensity,
    finalIntensity: intensity,
    hitExit,
    exitParam,
    exitPoint,
    exitDirection,
  };
}

function getReflectorHits(ray, reflector) {
  switch (reflector.type) {
    case 'parabolic':
      return rayParabola(ray, reflector.vertex, reflector.focalLength, reflector.aperture);

    case 'elliptical': {
      const startRad = (reflector.arcStartDeg * Math.PI) / 180;
      const endRad = (reflector.arcEndDeg * Math.PI) / 180;
      return rayEllipse(
        ray,
        reflector.center,
        reflector.semiMajor,
        reflector.semiMinor,
        reflector.rotation,
        startRad,
        endRad
      );
    }

    case 'freeform': {
      if (reflector.freeformMode === 'segments') {
        const lineSegs = getFreeformSegmentLineSegments(reflector);
        const hits = [];
        for (const [p1, p2] of lineSegs) {
          const hit = rayLineSegment(ray, p1, p2);
          if (hit) hits.push(hit);
        }
        return hits;
      }
      // Bezier mode
      const segments = getFreeformBezierSegments(reflector);
      const hits = [];
      for (const [p0, p1, p2, p3] of segments) {
        hits.push(...rayCubicBezier(ray, p0, p1, p2, p3));
      }
      return hits;
    }

    default:
      return [];
  }
}
