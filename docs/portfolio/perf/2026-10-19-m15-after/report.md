# Perf run 2026-10-19-m15-after

Median of 3 runs (fresh browser each; profiles and traces from run 1) · commit `f9a187c` · 2026-10-20T01:11:45.898Z · Apple M4 Max · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version) · 141.0.7390.37 · 1600x900 @2x · 17 items

| Scenario | fps (rAF) | p50 ms | p95 ms | frames > 33 ms | long tasks | longest ms (min–max) | max camera step cm | rendered frames | heap MB (Δ) | GC ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| load-layout | 21.2 | 16.7 | 133.4 | 14 | 5 | 105 (95–274) | 0 | 12 | 20.7 (+7.3) | 59 |
| switch-to-studio | 49.4 | 16.7 | 16.8 | 5 | 4 | 131 (110–158) | 347 | 39 | 26.2 (+5.4) | 2 |
| idle-house | 59.7 | 16.7 | 16.7 | 0 | 0 | 0 (0–0) | 0 | 0 | 27.2 (+0.2) | 1 |
| orbit-drag | 56.7 | 16.7 | 16.7 | 2 | 0 | 0 (0–0) | 37 | 303 | 33 (+5.7) | 1 |
| focus-room | 57.9 | 16.7 | 16.8 | 1 | 0 | 0 (0–71) | 85 | 58 | 29.5 (-3.4) | 2 |
| wheel-zoom | 59.8 | 16.7 | 16.7 | 0 | 0 | 0 (0–0) | 0 | 0 | 29.8 (+0.2) | 0 |
| idle-room | 59.7 | 16.7 | 16.8 | 0 | 0 | 0 (0–0) | 0 | 0 | 29.8 (+0.1) | 0 |
| walk-to-kitchen | 55.1 | 16.7 | 16.8 | 2 | 0 | 0 (0–0) | 260 | 189 | 36.1 (+6.2) | 5 |

## Top main-thread self time per scenario (V8 CPU profile)

### load-layout

| ms | function |
| --- | --- |
| 855 | `texSubImage2D :-1` |
| 50 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 46 | `toDataURL :-1` |
| 43 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 40 | `run :-1` |
| 37 | `(anonymous) three_examples_jsm_loaders_GLTFLoader__js.js:1879` |
| 32 | `(anonymous) chunk-URRDWL2E.js:23912` |
| 27 | `getProgramInfoLog :-1` |

### switch-to-studio

| ms | function |
| --- | --- |
| 210 | `texSubImage2D :-1` |
| 79 | `getProgramInfoLog :-1` |
| 52 | `WebGLRenderer.setSize chunk-URRDWL2E.js:40556` |
| 10 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 7 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 6 | `run :-1` |
| 6 | `clear :-1` |
| 5 | `resolveIncludes chunk-URRDWL2E.js:35332` |

### idle-house

| ms | function |
| --- | --- |
| 1 | `requestAnimationFrame :-1` |
| 1 | `cameraFrame camera.ts:74` |

### orbit-drag

| ms | function |
| --- | --- |
| 89 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 37 | `intersectTriangle chunk-URRDWL2E.js:6584` |
| 20 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 18 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 13 | `projectObject chunk-URRDWL2E.js:41023` |
| 12 | `getVertexPosition chunk-URRDWL2E.js:12170` |
| 11 | `setup chunk-URRDWL2E.js:32830` |
| 10 | `bindVertexArray :-1` |

### focus-room

| ms | function |
| --- | --- |
| 49 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 6 | `tick :5` |
| 5 | `projectObject chunk-URRDWL2E.js:41023` |
| 5 | `copyArray chunk-URRDWL2E.js:34565` |
| 4 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 3 | `set chunk-URRDWL2E.js:3304` |
| 3 | `bindVertexArray :-1` |
| 3 | `easeInOut camera.ts:61` |

### wheel-zoom

| ms | function |
| --- | --- |
| 1 | `intersect chunk-TK7WHPHW.js:12798` |
| 1 | `cameraFrame camera.ts:74` |
| 1 | `at chunk-URRDWL2E.js:6311` |
| 1 | `compute chunk-TK7WHPHW.js:14216` |

### idle-room

| ms | function |
| --- | --- |

### walk-to-kitchen

| ms | function |
| --- | --- |
| 68 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 16 | `(anonymous) index.ts:151` |
| 12 | `walkerStep index.ts:150` |
| 10 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 8 | `projectObject chunk-URRDWL2E.js:41023` |
| 8 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 7 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 6 | `upload chunk-URRDWL2E.js:35173` |

## Files

- `cpu-<scenario>.cpuprofile.gz`: gunzip, then open in Chrome DevTools → Performance (or `chrome://inspect` → Profiler) or speedscope.app.
- `trace-<scenario>.json.gz`: Chrome trace with frames, GPU and main-thread tasks; open in Chrome DevTools → Performance → Load profile, or ui.perfetto.dev.
- `results.json`: the numbers above.
