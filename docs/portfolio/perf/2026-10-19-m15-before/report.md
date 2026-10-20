# Perf run 2026-10-19-m15-before

Median of 3 runs (fresh browser each; profiles and traces from run 1) · commit `0761e71` · 2026-10-20T01:10:27.692Z · Apple M4 Max · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version) · 141.0.7390.37 · 1600x900 @2x · 17 items

| Scenario | fps (rAF) | p50 ms | p95 ms | frames > 33 ms | long tasks | longest ms (min–max) | max camera step cm | rendered frames | heap MB (Δ) | GC ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| load-layout | 25.7 | 16.7 | 149.9 | 13 | 4 | 156 (156–202) | 0 | — | 19.4 (+4.3) | 63 |
| switch-to-studio | 49.6 | 16.7 | 16.8 | 3 | 2 | 223 (192–253) | 1688 | — | 30.7 (+11.1) | 2 |
| idle-house | 59.8 | 16.7 | 16.8 | 0 | 0 | 0 (0–0) | 0 | — | 25.2 (+1.4) | 3 |
| orbit-drag | 59.9 | 16.7 | 16.8 | 0 | 0 | 0 (0–0) | 34 | — | 27.6 (+2.4) | 11 |
| focus-room | 59.1 | 16.7 | 16.8 | 1 | 0 | 0 (0–52) | 1731 | — | 25.3 (-2.3) | 1 |
| wheel-zoom | 59.8 | 16.7 | 16.7 | 0 | 0 | 0 (0–0) | 46 | — | 33.1 (+7.9) | 0 |
| idle-room | 59.7 | 16.7 | 16.8 | 0 | 0 | 0 (0–0) | 0 | — | 29.2 (-3.9) | 1 |

## Top main-thread self time per scenario (V8 CPU profile)

### load-layout

| ms | function |
| --- | --- |
| 924 | `texSubImage2D :-1` |
| 65 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 57 | `(anonymous) three_examples_jsm_loaders_GLTFLoader__js.js:1879` |
| 55 | `toDataURL :-1` |
| 52 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 49 | `(anonymous) chunk-URRDWL2E.js:23912` |
| 41 | `run :-1` |
| 37 | `GLTFBinaryExtension three_examples_jsm_loaders_GLTFLoader__js.js:1053` |

### switch-to-studio

| ms | function |
| --- | --- |
| 230 | `WebGLRenderer.setSize chunk-URRDWL2E.js:40556` |
| 113 | `texSubImage2D :-1` |
| 111 | `getProgramInfoLog :-1` |
| 26 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 11 | `clear :-1` |
| 9 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 8 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 7 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |

### idle-house

| ms | function |
| --- | --- |
| 56 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 15 | `WebGLShadowMap.render chunk-URRDWL2E.js:36983` |
| 12 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 9 | `setup chunk-URRDWL2E.js:32830` |
| 7 | `upload chunk-URRDWL2E.js:35173` |
| 6 | `loop chunk-TK7WHPHW.js:14152` |
| 5 | `projectObject chunk-URRDWL2E.js:41023` |
| 5 | `setValueM4 chunk-URRDWL2E.js:34667` |

### orbit-drag

| ms | function |
| --- | --- |
| 82 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 31 | `intersectTriangle chunk-URRDWL2E.js:6584` |
| 29 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 15 | `(anonymous) @react-three_drei.js:528` |
| 13 | `projectObject chunk-URRDWL2E.js:41023` |
| 12 | `_computeIntersections chunk-URRDWL2E.js:12220` |
| 11 | `getX chunk-URRDWL2E.js:13870` |
| 11 | `update chunk-URRDWL2E.js:31899` |

### focus-room

| ms | function |
| --- | --- |
| 19 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 9 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 9 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 4 | `uniformMatrix4fv :-1` |
| 4 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 4 | `(anonymous) @react-three_drei.js:528` |
| 3 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 3 | `clear :-1` |

### wheel-zoom

| ms | function |
| --- | --- |
| 23 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 12 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 11 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 5 | `projectObject chunk-URRDWL2E.js:41023` |
| 5 | `markUniformsLightsNeedsUpdate chunk-URRDWL2E.js:41478` |
| 4 | `copyArray chunk-URRDWL2E.js:34565` |
| 4 | `upload chunk-URRDWL2E.js:35173` |
| 4 | `bindVertexArray :-1` |

### idle-room

| ms | function |
| --- | --- |
| 31 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 10 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 5 | `setup chunk-URRDWL2E.js:32830` |
| 5 | `upload chunk-URRDWL2E.js:35173` |
| 5 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 5 | `multiplyMatrices chunk-URRDWL2E.js:7082` |
| 4 | `refreshUniformsCommon chunk-URRDWL2E.js:39908` |
| 4 | `intersectsSphere chunk-URRDWL2E.js:15358` |

## Files

- `cpu-<scenario>.cpuprofile.gz`: gunzip, then open in Chrome DevTools → Performance (or `chrome://inspect` → Profiler) or speedscope.app.
- `trace-<scenario>.json.gz`: Chrome trace with frames, GPU and main-thread tasks; open in Chrome DevTools → Performance → Load profile, or ui.perfetto.dev.
- `results.json`: the numbers above.
