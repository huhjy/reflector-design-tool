// Reflector shape optimizer
// Uses multi-parameter hill climbing with adaptive perturbation and restarts

import { traceScene } from './tracer.js';
import { computeEfficiency, computeDistribution } from './analysis.js';

const objectives = {
  rayEfficiency(result, scene) {
    return computeEfficiency(result, scene).rayEfficiency;
  },
  powerEfficiency(result, scene) {
    return computeEfficiency(result, scene).intensityEfficiency;
  },
  uniformity(result, scene) {
    const eff = computeEfficiency(result, scene);
    if (eff.rayEfficiency < 5) return eff.rayEfficiency;
    return computeDistribution(result, 30).uniformity * 100;
  },
  balanced(result, scene) {
    const eff = computeEfficiency(result, scene);
    const dist = computeDistribution(result, 30);
    return eff.intensityEfficiency * 0.5
      + dist.uniformity * 100 * 0.3
      + (100 - Math.abs(dist.fwhm - 80)) * 0.2;
  },
};

function getParameters(scene) {
  const r = scene.reflector;
  const params = [];

  if (r.type === 'parabolic') {
    params.push(
      { name: 'vertex.x', get: () => r.vertex.x, set: (v) => r.vertex.x = v, min: -30, max: 30, step: 1 },
      { name: 'vertex.y', get: () => r.vertex.y, set: (v) => r.vertex.y = v, min: -30, max: 5, step: 1 },
      { name: 'focalLength', get: () => r.focalLength, set: (v) => r.focalLength = v, min: 2, max: 50, step: 0.5 },
      { name: 'aperture', get: () => r.aperture, set: (v) => r.aperture = v, min: 20, max: 200, step: 2 },
    );
  } else if (r.type === 'elliptical') {
    params.push(
      { name: 'center.x', get: () => r.center.x, set: (v) => r.center.x = v, min: -30, max: 30, step: 1 },
      { name: 'center.y', get: () => r.center.y, set: (v) => r.center.y = v, min: 0, max: 80, step: 1 },
      { name: 'semiMajor', get: () => r.semiMajor, set: (v) => r.semiMajor = v, min: 10, max: 100, step: 1 },
      { name: 'semiMinor', get: () => r.semiMinor, set: (v) => r.semiMinor = v, min: 10, max: 100, step: 1 },
      { name: 'rotation', get: () => r.rotation, set: (v) => r.rotation = v, min: -Math.PI, max: Math.PI, step: 0.05 },
      { name: 'arcStartDeg', get: () => r.arcStartDeg, set: (v) => r.arcStartDeg = v, min: 90, max: 270, step: 5 },
      { name: 'arcEndDeg', get: () => r.arcEndDeg, set: (v) => r.arcEndDeg = v, min: 270, max: 450, step: 5 },
    );
  } else if (r.type === 'freeform') {
    if (r.freeformMode === 'polyline' && r.vertices) {
      for (let i = 0; i < r.vertices.length; i++) {
        const v = r.vertices[i];
        params.push(
          { name: `vtx${i}.x`, get: () => v.x, set: (val) => v.x = val, min: -80, max: 80, step: 1 },
          { name: `vtx${i}.y`, get: () => v.y, set: (val) => v.y = val, min: -30, max: 100, step: 1 },
        );
      }
    } else if (r.controlPoints) {
      for (let i = 0; i < r.controlPoints.length; i++) {
        const cp = r.controlPoints[i];
        params.push(
          { name: `cp${i}.x`, get: () => cp.x, set: (v) => cp.x = v, min: -80, max: 80, step: 1 },
          { name: `cp${i}.y`, get: () => cp.y, set: (v) => cp.y = v, min: -10, max: 100, step: 1 },
        );
      }
    }
  }
  return params;
}

function saveParams(params) {
  return params.map(p => p.get());
}

function restoreParams(params, values) {
  for (let i = 0; i < params.length; i++) params[i].set(values[i]);
}

export function startOptimizer(scene, objectiveName, options = {}) {
  const {
    maxIterations = 500,
    onProgress = () => {},
    onComplete = () => {},
    shouldStop = () => false,
  } = options;

  const objectiveFn = objectives[objectiveName];
  if (!objectiveFn) throw new Error(`Unknown objective: ${objectiveName}`);

  const params = getParameters(scene);
  if (params.length === 0) {
    onComplete({ initialScore: 0, finalScore: 0, iterations: 0, improvement: 0 });
    return;
  }

  let bestResult = traceScene(scene);
  let bestScore = objectiveFn(bestResult, scene);
  const initialScore = bestScore;
  let bestParams = saveParams(params);

  // Adaptive perturbation scale per parameter
  const paramScales = params.map(() => 1.0);

  let iteration = 0;
  let stagnantCount = 0;
  const batchSize = 8;

  function step() {
    if (shouldStop() || iteration >= maxIterations) {
      restoreParams(params, bestParams);
      const finalResult = traceScene(scene);
      onProgress({
        iteration, maxIterations,
        score: bestScore, initialScore,
        improvement: bestScore - initialScore,
        result: finalResult,
      });
      onComplete({
        initialScore, finalScore: bestScore,
        iterations: iteration,
        improvement: bestScore - initialScore,
      });
      return;
    }

    for (let b = 0; b < batchSize && iteration < maxIterations; b++, iteration++) {
      const progress = iteration / maxIterations;
      const baseFactor = 0.15 * (1 - progress * 0.7);

      // Multi-parameter perturbation: perturb 1-3 params at once
      const numToPerturb = 1 + Math.floor(Math.random() * Math.min(3, params.length));
      const indices = [];
      while (indices.length < numToPerturb) {
        const idx = Math.floor(Math.random() * params.length);
        if (!indices.includes(idx)) indices.push(idx);
      }

      // Save and perturb
      const oldVals = indices.map(i => params[i].get());
      for (const idx of indices) {
        const param = params[idx];
        const range = param.max - param.min;
        const scale = paramScales[idx];
        const perturbation = (Math.random() - 0.5) * 2 * range * baseFactor * scale;
        param.set(Math.max(param.min, Math.min(param.max, param.get() + perturbation)));
      }

      const result = traceScene(scene);
      const score = objectiveFn(result, scene);

      if (score > bestScore) {
        bestScore = score;
        bestResult = result;
        bestParams = saveParams(params);
        stagnantCount = 0;
        // Reward successful parameters
        for (const idx of indices) {
          paramScales[idx] = Math.min(3.0, paramScales[idx] * 1.1);
        }
      } else {
        // Revert to best
        restoreParams(params, bestParams);
        stagnantCount++;
        // Shrink scales for failed params
        for (const idx of indices) {
          paramScales[idx] = Math.max(0.1, paramScales[idx] * 0.97);
        }
      }

      // Stagnation recovery: big random restart from best
      if (stagnantCount > 60) {
        restoreParams(params, bestParams);
        // Perturb ALL params moderately
        for (let i = 0; i < params.length; i++) {
          const range = params[i].max - params[i].min;
          const jump = (Math.random() - 0.5) * range * 0.2;
          params[i].set(Math.max(params[i].min, Math.min(params[i].max, params[i].get() + jump)));
        }
        const jumpResult = traceScene(scene);
        const jumpScore = objectiveFn(jumpResult, scene);
        if (jumpScore > bestScore) {
          bestScore = jumpScore;
          bestResult = jumpResult;
          bestParams = saveParams(params);
        } else {
          restoreParams(params, bestParams);
        }
        // Reset scales
        for (let i = 0; i < paramScales.length; i++) paramScales[i] = 1.0;
        stagnantCount = 0;
      }
    }

    onProgress({
      iteration, maxIterations,
      score: bestScore, initialScore,
      improvement: bestScore - initialScore,
      result: bestResult,
    });

    setTimeout(step, 0);
  }

  setTimeout(step, 0);
}

export const objectiveNames = Object.keys(objectives);

export const objectiveDescriptions = {
  rayEfficiency: 'Maximize the number of rays reaching the exit',
  powerEfficiency: 'Maximize total light power at the exit',
  uniformity: 'Maximize evenness of light spread across the exit',
  balanced: 'Balance power efficiency, uniformity, and beam width',
};
