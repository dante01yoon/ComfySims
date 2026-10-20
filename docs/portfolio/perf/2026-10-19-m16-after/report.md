# Perf run 2026-10-19-m16-after

Median of 3 runs (fresh browser each; profiles and traces from run 1) · commit `6879ae4` · 2026-10-20T02:57:40.714Z · Apple M4 Max · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version) · 141.0.7390.37 · 1600x900 @2x · 17 items

| Scenario | fps (rAF) | p50 ms | p95 ms | frames > 33 ms | long tasks | longest ms (min–max) | max camera step cm | rendered frames | heap MB (Δ) | GC ms | GPU textures MB | draw calls | triangles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| load-layout | 57.6 | 16.7 | 16.8 | 3 | 1 | 66 (64–80) | 0 | 27 | 22.8 (+8.4) | 24 | 209.3 | 52 | 376255 |
| switch-to-studio | 56.2 | 16.7 | 16.8 | 2 | 1 | 69 (54–78) | 85 | 54 | 29.5 (+7.9) | 1 | 209.3 | 224 | 807350 |
| idle-house | 59.5 | 16.7 | 16.7 | 0 | 0 | 0 (0–0) | 0 | 0 | 31.2 (+0.9) | 1 | 209.3 | 224 | 807350 |
| orbit-drag | 58.9 | 16.7 | 16.7 | 1 | 0 | 0 (0–0) | 35 | 305 | 26.9 (-4.3) | 9 | 209.3 | 224 | 807350 |
| focus-room | 59.1 | 16.7 | 16.8 | 1 | 0 | 0 (0–0) | 88 | 61 | 33.1 (+7.2) | 0 | 209.3 | 138 | 604265 |
| wheel-zoom | 59.5 | 16.7 | 16.8 | 0 | 0 | 0 (0–0) | 19 | 154 | 28.5 (-4.6) | 4 | 209.3 | 138 | 604265 |
| idle-room | 59.8 | 16.7 | 16.8 | 0 | 0 | 0 (0–0) | 0 | 0 | 29.2 (+0.7) | 0 | 209.3 | 138 | 604265 |
| reload-layout | 54.5 | 16.7 | 33.3 | 1 | 0 | 0 (0–0) | 0 | 26 | 27.9 (+9.3) | 10 | 209.3 | 52 | 376255 |
| switch-to-studio-again | 55.8 | 16.7 | 16.8 | 2 | 1 | 76 (75–87) | 83 | 53 | 40.5 (-0.6) | 0 | 209.3 | 224 | 807350 |
| studio-settled | 59.4 | 16.7 | 16.7 | 0 | 0 | 0 (0–0) | 0 | 0 | 41.3 (+0.8) | 0 | 209.3 | 224 | 807350 |
| walk-to-kitchen | 59.5 | 16.7 | 16.8 | 1 | 0 | 0 (0–0) | 106 | 210 | 30.1 (+1.6) | 10 | 209.3 | 142 | 505418 |

## Top main-thread self time per scenario (V8 CPU profile)

### load-layout

| ms | function |
| --- | --- |
| 81 | `toDataURL :-1` |
| 71 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 64 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 56 | `run :-1` |
| 39 | `texSubImage2D :-1` |
| 34 | `getProgramInfoLog :-1` |
| 20 | `(anonymous) fit-jobs.ts:51` |
| 13 | `(anonymous) three_examples_jsm_loaders_GLTFLoader__js.js:1879` |

### switch-to-studio

| ms | function |
| --- | --- |
| 34 | `getProgramInfoLog :-1` |
| 13 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 9 | `tick :5` |
| 5 | `clear :-1` |
| 4 | `setProgram chunk-URRDWL2E.js:41285` |
| 3 | `upload chunk-URRDWL2E.js:35173` |
| 3 | `run :-1` |
| 3 | `sort chunk-URRDWL2E.js:36471` |

### idle-house

| ms | function |
| --- | --- |
| 2 | `requestAnimationFrame :-1` |

### orbit-drag

| ms | function |
| --- | --- |
| 77 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 20 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 14 | `(anonymous) @react-three_drei.js:528` |
| 12 | `setup chunk-URRDWL2E.js:32830` |
| 12 | `intersectTriangle chunk-URRDWL2E.js:6584` |
| 11 | `bindVertexArray :-1` |
| 7 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 7 | `upload chunk-URRDWL2E.js:35173` |

### focus-room

| ms | function |
| --- | --- |
| 12 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 4 | `setup chunk-URRDWL2E.js:32830` |
| 4 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 4 | `(anonymous) @react-three_drei.js:528` |
| 4 | `tick :5` |
| 3 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 3 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 3 | `setValueM4 chunk-URRDWL2E.js:34667` |

### wheel-zoom

| ms | function |
| --- | --- |
| 19 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 7 | `bindVertexArray :-1` |
| 6 | `copyArray chunk-URRDWL2E.js:34565` |
| 5 | `multiplyMatrices chunk-URRDWL2E.js:7082` |
| 5 | `setup chunk-URRDWL2E.js:32830` |
| 5 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 4 | `clear :-1` |
| 4 | `renderObject chunk-URRDWL2E.js:37130` |

### idle-room

| ms | function |
| --- | --- |

### reload-layout

| ms | function |
| --- | --- |
| 134 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 106 | `run :-1` |
| 46 | `toDataURL :-1` |
| 30 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 21 | `getProgramInfoLog :-1` |
| 16 | `diffProps chunk-TK7WHPHW.js:12649` |
| 13 | `Blob :-1` |
| 11 | `request.onsuccess fit-jobs.ts:25` |

### switch-to-studio-again

| ms | function |
| --- | --- |
| 54 | `getProgramInfoLog :-1` |
| 10 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 6 | `getShaderInfoLog :-1` |
| 5 | `setProgram chunk-URRDWL2E.js:41285` |
| 4 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 4 | `markUniformsLightsNeedsUpdate chunk-URRDWL2E.js:41478` |
| 3 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 3 | `shaderSource :-1` |

### studio-settled

| ms | function |
| --- | --- |
| 1 | `cameraFrame camera.ts:74` |

### walk-to-kitchen

| ms | function |
| --- | --- |
| 31 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 11 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 9 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 9 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 7 | `footprint index.ts:1` |
| 7 | `renderObject chunk-URRDWL2E.js:37130` |
| 7 | `setup chunk-URRDWL2E.js:32830` |
| 6 | `multiplyMatrices chunk-URRDWL2E.js:7082` |

## Files

- `cpu-<scenario>.cpuprofile.gz`: gunzip, then open in Chrome DevTools → Performance (or `chrome://inspect` → Profiler) or speedscope.app.
- `trace-<scenario>.json.gz`: Chrome trace with frames, GPU and main-thread tasks; open in Chrome DevTools → Performance → Load profile, or ui.perfetto.dev.
- `results.json`: the numbers above.
