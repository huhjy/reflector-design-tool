# 3D Reflector Analyzer — Design / Spec

**Status:** Draft for review
**Date:** 2026-06-30
**Author:** design session
**Scope decisions (from kickoff):** Imported reflectors are a *mix* of rotationally‑symmetric and freeform geometry. Analysis must be geometry‑agnostic; optimization is scoped symmetric‑first with a documented path to freeform.

**Engineering standard:** All code in this project follows the *Clean Code Playbook* (`C:\Users\jhuh\Downloads\Clean_Code_Playbook_for_LLMs_FULL.md`). See §0.

---

## 0. Engineering standards (how we build this)

This project is written to the *Clean Code Playbook*. The parts that materially shape this plan:

### 0.1 Build order (per feature/module, never skipped)
1. Implement the **simplest correct** solution.
2. Add/update **tests** that lock the behavior.
3. **Refactor** for cleanliness — no behavior change.
4. Short **self-review** against the playbook checklist (names reveal intent, single responsibility, no flag params / hidden side effects, happy path top‑to‑bottom, explicit errors, duplication removed or consciously accepted, tests readable).

These steps don't merge; we don't refactor before behavior is correct and tested.

### 0.2 No speculative abstractions
The module layout in §4 is a **target shape, not a build-it-all-up-front mandate**. We add a seam (adapter, interface, extension point) only when a second real use case exists or extensibility is explicitly required. Concretely:
- M0/M1 may keep the tracer and analysis as concrete functions; we extract interfaces only once the symmetric *and* freeform optimization paths both need them.
- Prefer small duplication over premature abstraction.

### 0.3 Testing strategy (the repo has none today)
The current 2D tool ships no test harness. Adopting the playbook means **M0 introduces one**, kept consistent with the no‑build ethos:
- **Runner:** Node's built‑in `node:test` + `node:assert` — zero dependencies, no bundler, runs plain ES modules. (`package.json` with only a `"test"` script; no framework install.)
- **What gets unit tested (pure, deterministic — high value):** ray–triangle intersection, vector reflection, LED area+angular sampling *distributions* (seeded RNG + statistical tolerance), far‑field binning, beam metrics (FWHM/peak/% in cone), symmetry detection, meridian extraction, IES/LDT export formatting.
- **Monte‑Carlo determinism:** inject a seeded RNG so sampling tests are repeatable; assert against analytic expectations within tolerance (e.g. a flat mirror sends a known cone to a known direction).
- **Boundaries (Three.js, three‑mesh‑bvh):** wrapped behind thin adapters in `mesh.js` / `viewport.js`; covered by a couple of **learning/contract tests** rather than deep mocking. DOM/viewport glue stays thin and is verified via the live preview workflow, not unit tests.
- **Test layout:** colocated `*.test.js` next to modules, or a `3d/test/` mirror — decided at M0.

### 0.4 Boundaries & errors
Third‑party types (Three.js, BVH) stay at the edges behind domain‑friendly adapters so a library swap is localized. Import/parse failures (bad STL, non‑manifold mesh, ambiguous units) surface as explicit, contextual errors to the UI — not silent nulls or swallowed catches.

---

## 1. Goal & Motivation

Today's tool ([index.html](../index.html), [js/](../js)) is a 2D ray‑tracing reflector **designer**: you build a profile from curves/vertices and it traces a fan of rays in a plane. The ask is a different, complementary tool:

> A **3D** tool that **imports an STL mesh** of an existing reflector, **analyzes** the beam it produces from an LED source, and — as a bonus — can **optimize** the reflector shape.

The emphasis is reversed from the current app: we're primarily *analyzing supplied geometry*, not authoring it. Optimization is a stretch goal that depends heavily on geometry type.

### Goals
1. Import an STL (binary + ASCII) and display it in an interactive 3D viewport.
2. Place/configure an LED source (position, orientation, size, angular emission profile).
3. Monte‑Carlo ray‑trace the LED emission against the mesh with specular reflection + multi‑bounce.
4. Produce standard photometric analysis: far‑field intensity distribution, beam metrics, target‑plane illuminance.
5. (Bonus) Optimize the reflector to hit a beam target — symmetric case first.

### Non‑goals (v1)
- Authoring meshes from scratch (the 2D tool already does profile authoring).
- Wavelength/color, polarization, interference, diffraction (geometric optics only).
- Refractive optics (lenses, TIR collimators). Reflection only in v1; refraction is a later epic.
- Cloud/server compute. Everything runs client‑side in the browser.

---

## 2. Why this is feasible in the browser

The current engine already proves the architecture: emit rays → intersect surface → reflect → accumulate → analyze. Going to 3D changes two boxes and adds one:

| Concern | 2D today | 3D plan |
|---|---|---|
| Geometry | Analytic curves (`rayParabola`, `rayCubicBezier`, …) in [intersect.js](../js/engine/intersect.js) | Triangle mesh from STL |
| Intersection | Closed‑form per shape | Ray–triangle (Möller–Trumbore) via a **BVH** |
| Source | Fan of N rays in a plane | Monte‑Carlo samples over area × solid angle |
| Analysis | 1D angle histogram ([analysis.js](../js/engine/analysis.js)) | 2D (θ,φ) far‑field map + metrics |
| Viewport | Canvas 2D ([canvas-renderer.js](../js/renderer/canvas-renderer.js)) | WebGL (Three.js) |

The one genuinely new hard part is **fast ray–mesh intersection**. Naive ray‑vs‑all‑triangles is `O(rays × triangles)` — fatal when a reflector STL is 50k–500k triangles and you want 10⁵–10⁶ rays. The fix is a bounding‑volume hierarchy; [`three-mesh-bvh`](https://github.com/gkjohnson/three-mesh-bvh) is mature and turns this into milliseconds‑per‑10k‑rays territory, especially off the main thread.

---

## 3. Tech Stack

- **Three.js** — viewport, camera/orbit controls, `STLLoader`, math (`Vector3`, `Raycaster`, `Matrix4`).
- **three-mesh-bvh** — accelerated `raycast` / `raycastFirst` against the mesh.
- **Plain ES modules, no build step** — preserve the current repo's zero‑tooling ergonomics. Load Three.js + three‑mesh‑bvh via an **import map** pointing at an ESM CDN (e.g. `esm.sh`/`jsdelivr`), mirroring how `js/main.js` already uses bare module imports.
- **Web Workers** — run the tracer in a worker pool so the UI stays responsive; the BVH is serialized into a transferable typed‑array buffer (three‑mesh‑bvh supports this) so workers share it without re‑building.
- **Charting** — reuse a lightweight canvas approach like the current [charts.js](../js/ui/charts.js); polar/heatmap plots are custom‑drawn.

> **Decision needed (low‑stakes):** import‑map + CDN vs. vendoring the two libs into `/vendor`. Recommendation: import‑map + CDN for v1, vendor later if offline use matters.

---

## 4. Architecture

New, parallel app under `3d/` so the existing 2D tool is untouched. It deliberately echoes the current module layout (`engine/`, `ui/`, `renderer/`) so concepts transfer.

```
3d/
  index.html              # import map + viewport canvas + sidebar
  js/
    main3d.js             # bootstrap/glue (mirrors js/main.js)
    scene3d.js            # data model: source, mesh ref, target, materials
    engine/
      mesh.js             # STL load, normalize/center, units, BVH build
      source.js           # LED area+angular sampling (Monte-Carlo)
      tracer3d.js         # worker-driven ray-mesh trace + bounce loop
      tracer.worker.js    # the actual hot loop (BVH raycast)
      analysis3d.js       # far-field binning, beam metrics, illuminance
      symmetry.js         # detect axis, extract meridian profile
      optimizer3d.js      # profile-based optimization (reuses concepts)
    renderer/
      viewport.js         # Three.js scene, mesh, gizmos, ray viz
    ui/
      controls3d.js       # sidebar panels
      plots.js            # polar intensity + illuminance heatmap
```

### Data flow

```
STL file ─▶ mesh.js (parse, normalize, build BVH)
                         │
LED config ─▶ source.js (sample rays) ─▶ tracer.worker.js (BVH bounce loop)
                                                │ exit rays (dir + weight)
                                                ▼
                                   analysis3d.js (far-field, metrics)
                                                │
                                                ▼
                              viewport.js + plots.js (render + charts)
                                                │
                            optimizer3d.js ◀────┘ (closes the loop on geometry)
```

---

## 5. Component Specs

### 5.1 Mesh import (`mesh.js`)
- `STLLoader` for binary + ASCII. Recompute vertex normals (STL facet normals are frequently wrong/missing); `computeVertexNormals()` after merging coincident vertices.
- **Units:** STL is unitless. Provide a unit selector (mm/cm/in) + auto‑scale to bbox; default mm to match the 2D tool.
- **Orientation/placement:** show bbox + axes; let the user set which axis the LED faces and re‑center the mesh origin. Critical because analysis is defined relative to the optical axis.
- Build BVH (`MeshBVH`), serialize to a transferable buffer for workers.
- Sanity report: triangle count, watertight? (edge‑manifold check), bbox dims, suspicious scale.

### 5.2 Light source (`source.js`)
Generalize the LED model from [scene.js](../js/scene.js) (`ledWidth`, `ledHeight`, `emissionAngleMin/Max`, `intensityProfile`) into 3D:
- **Area emitter:** sample points uniformly over the LED rectangle (W×H), placed/oriented in 3D.
- **Angular profile:** Lambertian (cosθ) by default; uniform; cosⁿ; plus an **import slot for a measured profile** (later). Sample directions via the chosen distribution (cosine‑weighted hemisphere for Lambertian).
- **Ray weighting:** each sample carries an intensity weight so Monte‑Carlo sums are unbiased; total emitted flux is the normalization denominator (mirrors `intensityEfficiency` in [analysis.js](../js/engine/analysis.js)).
- Ray budget: interactive preview (~10k–50k) vs. final analysis (~1M), like the 2D tool's `rayCount` slider but bigger.

### 5.3 Tracer (`tracer3d.js` + `tracer.worker.js`)
Direct 3D analog of [tracer.js](../js/engine/tracer.js)'s bounce loop:
1. For each sampled ray: `bvh.raycastFirst` → nearest triangle hit.
2. Reflect about the interpolated normal (`reflectDirection` → 3D vector reflection). Optional roughness: perturb within a cone (a 3D `diffuseDirection`).
3. Multiply intensity by `reflectivity`; stop at `MAX_BOUNCES` (reuse the constant idea from [ray.js](../js/engine/ray.js)) or when intensity < ε.
4. A ray that leaves the mesh bbox upward/forward without further hits is an **exit ray**: record `(direction, weight, exitPoint)`.
- Parallelize across workers by splitting the ray batch; merge exit‑ray lists.
- Optional: keep a small subset of full ray paths for visualization (don't store 1M polylines).

### 5.4 Analysis (`analysis3d.js`)
This is where 3D meaningfully differs. Geometry‑agnostic (works for symmetric *and* freeform meshes):
- **Far‑field intensity distribution:** bin exit rays by direction into a (θ,φ) grid → candela‑style intensity map. This is the goniophotometric output; render as a polar plot (and/or C‑plane cuts at φ = 0°/90°).
- **Beam metrics:** peak intensity direction, **FWHM beam angle**, fraction of flux within a target cone, centroid/aim direction, total efficiency (captured/emitted).
- **Target‑plane illuminance:** project exit rays onto a user‑placed plane at distance D → 2D illuminance heatmap (lux‑like), with uniformity + hotspot metrics.
- **Export:** **IES (LM‑63)** / **EULUMDAT (LDT)** for the far‑field — these are the industry interchange formats and make the tool immediately useful to lighting workflows. (Stretch.)

### 5.5 Symmetry detection (`symmetry.js`) — enables the optimization bonus
Because geometry is a *mix*, we detect per‑import:
- Fit a candidate optical axis (PCA / user‑specified), test rotational symmetry by sampling radial profiles at multiple φ and measuring variance.
- **If symmetric:** extract the 2D **meridian profile** (r, z) — this is the bridge to the existing 2D machinery.
- **If not:** mark as freeform; analysis still runs fully, optimization uses the harder path (§6).

---

## 6. Optimization (the bonus) — phased by geometry

Optimizing an arbitrary STL is *not* like nudging 15 vertices: thousands of unstructured vertices, no parametric handles. Realistic paths, easiest → hardest:

1. **Rotationally‑symmetric profile optimization (PRIMARY).** Extract the meridian profile via `symmetry.js`, optimize that profile against a beam objective, sweep back into a 3D surface, re‑evaluate. This **directly reuses the conceptual machinery** in [optimizer.js](../js/engine/optimizer.js) (parameter list + objective + perturb/accept loop) and the parametrization ideas from [reflector-shapes.js](../js/engine/reflector-shapes.js). Highest value‑for‑effort.
2. **Parametric re‑fit (freeform, tractable).** Fit the mesh to a low‑DOF surface (surface‑of‑revolution with spline profile, or NURBS / radial‑basis patches), optimize the handful of control parameters, regenerate mesh. Standard in optical design.
3. **Free‑vertex optimization (freeform, research‑grade).** Move every vertex along its normal with smoothness regularization; really wants differentiable rendering for gradients. **Out of scope for v1** — documented as future work.

Objectives mirror the 2D tool's `targetBeam`/`beamConcentration` (peak angle, FWHM, % in window, efficiency) but evaluated on the 3D far‑field.

---

## 7. UI / UX

Layout mirrors [index.html](../index.html): left toolbar, central viewport, right sidebar of collapsible panels.
- **Toolbar:** Import STL, units, reset view, run/stop analysis, export (IES/LDT, screenshot).
- **Viewport:** orbit/pan/zoom; mesh with optional wireframe; LED gizmo; target‑plane gizmo; toggle to draw a sampled subset of ray paths (like the 2D "Show Rays").
- **Sidebar panels:** Mesh (stats, units, orientation), Light Source, Material (reflectivity, specular/rough), Analysis (ray budget, target cone/plane), Optimizer (objective, iterations — symmetric only initially), Results (metrics + polar plot + illuminance heatmap).

---

## 8. Performance plan

- BVH is the load‑bearing decision; without it this is unusable.
- Two ray budgets: **interactive** (fast, noisy) and **final** (high, smooth), like the optimizer temporarily bumping `rayCount` in [main.js](../js/main.js).
- Worker pool sized to `navigator.hardwareConcurrency`; shared serialized BVH buffer.
- Cap stored ray paths for viz (e.g. ≤2k) independent of the analysis ray count.
- **Stretch:** WebGPU compute path for the trace if CPU workers prove too slow at 1M+ rays. Keep the CPU path as the reference/fallback.

---

## 9. Risks & open questions

| Risk / question | Notes |
|---|---|
| Dirty STLs (non‑manifold, flipped normals, gaps) | Need robust normal recompute + a "leak" warning. Two‑sided reflection option as a fallback. |
| Mesh resolution vs. accuracy | Coarse facets quantize the beam; surface a triangle‑count/quality readout. |
| Performance at 1M rays in JS workers | Mitigated by BVH; WebGPU is the escape hatch. Validate early with a stress STL. |
| Freeform optimization scope creep | Explicitly v2+. v1 optimizes the symmetric case only. |
| Units/orientation ambiguity in STL | Mandatory user confirmation step on import. |
| Library delivery (CDN vs vendored) | CDN+import‑map for v1; revisit for offline. |
| Reflectance model fidelity | v1 = constant specular + optional roughness cone. Measured BRDF later. |

---

## 10. Milestones

- **M0 — Spike (de‑risk) + test harness:** Three.js viewport + STL load + three‑mesh‑bvh raycast of a few thousand rays, single bounce, count exits. Proves the hard part. Also stands up the `node:test` harness (§0.3) with the first unit tests (ray–triangle, vector reflection) so every later milestone builds test‑first. *(small)*
- **M1 — Analysis core:** area+angular LED sampling, multi‑bounce in a worker, far‑field polar plot + beam metrics + efficiency. Delivers the whole "import & analyze" ask. *(medium)*
- **M2 — Photometry polish:** target‑plane illuminance heatmap, IES/LDT export, ray‑path visualization, material panel. *(medium)*
- **M3 — Optimization (symmetric):** symmetry detection + meridian extraction + profile optimizer reusing existing concepts. *(medium‑large)*
- **M4 — Freeform optimization (stretch):** parametric re‑fit path. *(large, research‑y)*

---

## 11. What we reuse from the current codebase

- **Conceptual pipeline** (emit → intersect → reflect → accumulate → analyze) from [tracer.js](../js/engine/tracer.js).
- **LED model fields** and intensity profiles from [scene.js](../js/scene.js) / [tracer.js](../js/engine/tracer.js).
- **Optimizer pattern** (parameter list + objective fn + perturb/accept/restart) from [optimizer.js](../js/engine/optimizer.js) — applied to the extracted profile.
- **Metric definitions** (efficiency, FWHM, peak angle, % in window) from [analysis.js](../js/engine/analysis.js), lifted to 3D.
- **UI shell conventions** (collapsible panels, sliders with live values, info tips) from [index.html](../index.html) / [controls.js](../js/ui/controls.js).
- **No‑build ES‑module ethos** from [main.js](../js/main.js).
