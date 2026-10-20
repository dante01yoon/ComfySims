# Perf run 2026-10-19-m15-final

Median of 3 runs (fresh browser each; profiles and traces from run 1) · commit `899ecdc` · 2026-10-20T01:39:36.406Z · Apple M4 Max · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version) · 141.0.7390.37 · 1600x900 @2x · 17 items

| Scenario | fps (rAF) | p50 ms | p95 ms | frames > 33 ms | long tasks | longest ms (min–max) | max camera step cm | rendered frames | heap MB (Δ) | GC ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| load-layout | 20.6 | 33.3 | 150.1 | 14 | 4 | 145 (110–188) | 0 | 14 | 21.7 (+8.2) | 57 |
| switch-to-studio | 49.1 | 16.7 | 16.8 | 4 | 4 | 151 (109–176) | 339 | 38 | 26.1 (+4.6) | 6 |
| idle-house | 59.7 | 16.7 | 16.7 | 0 | 0 | 0 (0–0) | 0 | 0 | 27 (+0.2) | 0 |
| orbit-drag | 58.8 | 16.7 | 16.8 | 1 | 0 | 0 (0–0) | 68 | 305 | 32.4 (+5.4) | 3 |
| focus-room | 59.6 | 16.7 | 16.8 | 0 | 0 | 0 (0–52) | 83 | 61 | 29.6 (+7.2) | 4 |
| wheel-zoom | 59.6 | 16.7 | 16.8 | 0 | 0 | 0 (0–0) | 19 | 154 | 24.4 (-5.2) | 1 |
| idle-room | 59.7 | 16.7 | 16.7 | 0 | 0 | 0 (0–0) | 0 | 0 | 24.5 (+0.1) | 1 |
| walk-to-kitchen | 59.2 | 16.7 | 16.7 | 1 | 0 | 0 (0–0) | 36 | 207 | 26.1 (+1.7) | 7 |

## Top main-thread self time per scenario (V8 CPU profile)

### load-layout

| ms | function |
| --- | --- |
| 1005 | `texSubImage2D :-1` |
| 64 | `toDataURL :-1` |
| 63 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 59 | `(anonymous) three_examples_jsm_loaders_GLTFLoader__js.js:1879` |
| 56 | `(anonymous) chunk-URRDWL2E.js:23912` |
| 46 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 41 | `run :-1` |
| 40 | `GLTFBinaryExtension three_examples_jsm_loaders_GLTFLoader__js.js:1053` |

### switch-to-studio

| ms | function |
| --- | --- |
| 157 | `texSubImage2D :-1` |
| 105 | `WebGLRenderer.setSize chunk-URRDWL2E.js:40556` |
| 66 | `getProgramInfoLog :-1` |
| 11 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 5 | `run :-1` |
| 4 | `shaderSource :-1` |
| 4 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 4 | `tick :5` |

### idle-house

| ms | function |
| --- | --- |
| 4 | `requestAnimationFrame :-1` |

### orbit-drag

| ms | function |
| --- | --- |
| 74 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 29 | `intersectTriangle chunk-URRDWL2E.js:6584` |
| 25 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 16 | `subVectors chunk-URRDWL2E.js:2562` |
| 10 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 9 | `setup chunk-URRDWL2E.js:32830` |
| 9 | `setProgram chunk-URRDWL2E.js:41285` |
| 8 | `copyArray chunk-URRDWL2E.js:34565` |

### focus-room

| ms | function |
| --- | --- |
| 14 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 5 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 4 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 4 | `setup chunk-URRDWL2E.js:32830` |
| 3 | `removeAttribute :-1` |
| 3 | `tick :5` |
| 3 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 3 | `bindVertexArray :-1` |

### wheel-zoom

| ms | function |
| --- | --- |
| 21 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 7 | `update chunk-URRDWL2E.js:31899` |
| 6 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 5 | `setup chunk-URRDWL2E.js:32830` |
| 5 | `setValueM4 chunk-URRDWL2E.js:34667` |
| 4 | `copyArray chunk-URRDWL2E.js:34565` |
| 4 | `update2 @react-three_drei.js:20354` |
| 4 | `projectObject chunk-URRDWL2E.js:41023` |

### idle-room

| ms | function |
| --- | --- |
| 4 | `requestAnimationFrame :-1` |
| 1 | `cameraFrame camera.ts:74` |

### walk-to-kitchen

| ms | function |
| --- | --- |
| 27 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 9 | `bindVertexArray :-1` |
| 9 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 9 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 8 | `(anonymous) @react-three_drei.js:528` |
| 8 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 6 | `setup chunk-URRDWL2E.js:32830` |
| 6 | `projectObject chunk-URRDWL2E.js:41023` |

## Files

- `cpu-<scenario>.cpuprofile.gz`: gunzip, then open in Chrome DevTools → Performance (or `chrome://inspect` → Profiler) or speedscope.app.
- `trace-<scenario>.json.gz`: Chrome trace with frames, GPU and main-thread tasks; open in Chrome DevTools → Performance → Load profile, or ui.perfetto.dev.
- `results.json`: the numbers above.
