# Case study: making a generated-furniture house feel smooth

Status: in progress (started 2026-10-19). This file is written as the work happens: measurements first, then decisions, then results.

## The complaint

Dante, 2026-10-19, after watching two smooth Three.js interior demos (img2interior, a Blender-baked room, and an 8-million-splat capture of a real living room): "지금 되게 버벅이고 방 안도 못돌아다니고 하잖아" — the editor stutters, and you cannot move around inside a room.

## Step 1 — measure before guessing

Tool: [`demo/measure-motion.mjs`](../../demo/measure-motion.mjs). It opens the editor in a real GPU browser (Chromium, Metal), loads the 17-piece demo house (every piece generated on Comfy Cloud), and records per-frame timestamps, long tasks (> 50 ms), the camera position every frame, and a V8 CPU profile per scenario.

Machine: Apple M4 Max, 1600 × 900 viewport at device pixel ratio 2. This is a fast GPU; an ordinary laptop is slower, so these numbers are a best case.

| Scenario | fps | p95 frame | frames > 33 ms | long tasks | longest | largest camera step in one frame |
| --- | --- | --- | --- | --- | --- | --- |
| load the house | 13.9 | 211 ms | 21 | 6 | 148 ms | — |
| switch editor → studio | 45.2 | 17.7 ms | 4 | 2 | 243 ms | 16.9 m |
| idle (whole house) | 59.9 | 17.6 ms | 1 | 0 | — | 0 |
| orbit drag | 57.2 | 17.6 ms | 3 | 0 | — | 0.3 m |
| focus a room | 58.7 | 17.5 ms | 1 | 0 | — | **17.5 m** |
| wheel zoom | 59.3 | 17.5 ms | 0 | 0 | — | 0.5 m |

Raw data: [`data/m15-before-dpr2.json`](data/m15-before-dpr2.json) (and `m15-before-dpr1.json`).

### What the numbers say

1. **Steady-state frame rate is not the problem.** Orbiting and idling hold 60 fps.
2. **The stutter is hitches and teleports.**
   - Loading the house drops to 14 fps with six main-thread stalls of up to 148 ms.
   - Switching to the studio freezes for 243 ms.
   - Focusing a room moves the camera 17.5 m in a single frame. There is no transition; the camera teleports.
3. **The controls have no inertia.** The camera stops dead when the mouse stops, and the wheel zooms in fixed jumps. The reference demos glide.
4. **There is no way to walk.** The only cameras are an orbit around the house and an eye-level render camera.

## Step 2 — find the causes (CPU profiles)

Self time during **load** (2.4 s window):

| Function | ms | Meaning |
| --- | --- | --- |
| `texSubImage2D` | 922 | uploading textures to the GPU, synchronously, on the main thread |
| `createObjectURL` | 154 | wrapping fitted GLB bytes as blob URLs |
| GLTFLoader parsing | ~180 | parsing 17 large GLBs |
| `toDataURL` | 72 | thumbnails |
| `getProgramInfoLog` | 26 | synchronous shader compile checks |

Self time during **editor → studio**:

| Function | ms | Meaning |
| --- | --- | --- |
| `WebGLRenderer.setSize` | 139 | the canvas changes size between views, so every render target (shadow map, AO buffers) is reallocated |
| `texSubImage2D` | 136 | more texture uploads |
| `getProgramInfoLog` | 80 | the studio's shaders (shadows, N8AO, tone mapping) compile on first use |

### Root cause: the generated assets are far heavier than a room needs

Every piece from the image-to-3D workflow comes out the same way:

| Asset | File | Triangles | Textures |
| --- | --- | --- | --- |
| armchair | 17.0 MB | 119,426 | 3 × 2048² PNG |
| sofa | 14.2 MB | 119,852 | 3 × 2048² PNG |
| car | 17.4 MB | 118,070 | 3 × 2048² PNG |
| … (15 total) | 205 MB | ~1.8 M | 45 × 2048² PNG |

- Three 2048² RGBA textures with mipmaps take about 48 MB of GPU memory per piece. That is about 800 MB for one furnished house, and every byte is uploaded on the main thread.
- A 70 cm armchair seen across a room covers a few hundred pixels on screen. It needs neither 120,000 triangles nor 2048² textures.
- Fitting already rewrites every GLB (`packages/fit`), so the cheapest place to fix the assets is that same step.

## Step 3 — plan

Two milestones, so each one has its own before/after:

- **M15 — Smooth camera and walk mode.**
  - Damped controls.
  - Eased transitions for every camera change: focus, view switch, render view.
  - A first-person walk mode inside rooms that stops at walls and passes through doors.
  - Render on demand.
- **M16 — Light assets, no hitches.**
  - At fit time, simplify meshes and shrink and compress textures.
  - Do the fitting and optimising in a Web Worker.
  - Cache the result.
  - Upload textures progressively.
  - Precompile shaders.
  - Keep the canvas size stable across views.

Targets (to be checked with the same script):

| Metric | Before | Target |
| --- | --- | --- |
| Load: longest main-thread stall | 148 ms | < 50 ms |
| Load: p95 frame | 211 ms | ≤ 33 ms |
| View switch: longest stall | 243 ms | < 50 ms |
| Focus: largest camera step per frame | 17.5 m | ≤ 0.5 m, transition 0.6–1 s |
| GPU texture memory per piece | ~48 MB | ≤ 6 MB |
| GLB size per piece | 7–17 MB | ≤ 2 MB |
| Walk inside a room | not possible | WASD + drag-look at 160 cm eye height; walls stop you, doors let you through |

## Log

- 2026-10-19 — Baseline measured; causes found from CPU profiles and GLB inspection; plan written.
