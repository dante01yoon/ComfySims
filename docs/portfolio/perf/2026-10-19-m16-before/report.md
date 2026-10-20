# Perf run 2026-10-19-m16-before

Median of 3 runs (fresh browser each; profiles and traces from run 1) · commit `c4f6d24` · 2026-10-20T02:55:53.097Z · Apple M4 Max · GPU ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version) · 141.0.7390.37 · 1600x900 @2x · 17 items

| Scenario | fps (rAF) | p50 ms | p95 ms | frames > 33 ms | long tasks | longest ms (min–max) | max camera step cm | rendered frames | heap MB (Δ) | GC ms | GPU textures MB | draw calls | triangles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| load-layout | 18.6 | 33.3 | 150 | 16 | 7 | 143 (84–246) | 0 | 17 | 21.5 (+6.3) | 53 | — | — | — |
| switch-to-studio | 46.2 | 16.7 | 16.8 | 4 | 4 | 167 (146–198) | 355 | 33 | 25.6 (+4) | 4 | — | — | — |
| idle-house | 59.8 | 16.7 | 16.7 | 0 | 0 | 0 (0–0) | 0 | 0 | 26.6 (+0.2) | 0 | — | — | — |
| orbit-drag | 54.8 | 16.7 | 16.8 | 1 | 0 | 0 (0–0) | 55 | 306 | 33.1 (+6) | 3 | — | — | — |
| focus-room | 57.4 | 16.7 | 16.7 | 1 | 0 | 0 (0–68) | 84 | 59 | 25.7 (-7.4) | 8 | — | — | — |
| wheel-zoom | 59.8 | 16.7 | 16.8 | 0 | 0 | 0 (0–0) | 19 | 154 | 32.3 (+6.6) | 1 | — | — | — |
| idle-room | 59.6 | 16.7 | 16.7 | 1 | 0 | 0 (0–0) | 0 | 0 | 32.4 (+0.1) | 0 | — | — | — |
| reload-layout | 19.8 | 16.7 | 183.3 | 16 | 11 | 130 (105–216) | 0 | 15 | 19.7 (-8.5) | 113 | — | — | — |
| switch-to-studio-again | 53 | 16.7 | 16.8 | 4 | 4 | 86 (86–92) | 170 | 46 | 26.4 (+6.9) | 3 | — | — | — |
| studio-settled | 59.6 | 16.7 | 16.8 | 0 | 0 | 0 (0–0) | 0 | 0 | 26.5 (+0.1) | 0 | — | — | — |
| walk-to-kitchen | 58.6 | 16.7 | 16.8 | 1 | 0 | 0 (0–0) | 109 | 207 | 22.3 (-3.8) | 9 | — | — | — |

## Top main-thread self time per scenario (V8 CPU profile)

### load-layout

| ms | function |
| --- | --- |
| 1284 | `texSubImage2D :-1` |
| 97 | `toDataURL :-1` |
| 59 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 50 | `(anonymous) chunk-URRDWL2E.js:23912` |
| 44 | `(anonymous) three_examples_jsm_loaders_GLTFLoader__js.js:1879` |
| 39 | `GLTFBinaryExtension three_examples_jsm_loaders_GLTFLoader__js.js:1053` |
| 39 | `run :-1` |
| 35 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |

### switch-to-studio

| ms | function |
| --- | --- |
| 145 | `texSubImage2D :-1` |
| 143 | `WebGLRenderer.setSize chunk-URRDWL2E.js:40556` |
| 84 | `getProgramInfoLog :-1` |
| 11 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 5 | `run :-1` |
| 5 | `traverse chunk-URRDWL2E.js:8699` |
| 4 | `setProgram chunk-URRDWL2E.js:41285` |
| 3 | `projectObject chunk-URRDWL2E.js:41023` |

### idle-house

| ms | function |
| --- | --- |
| 3 | `requestAnimationFrame :-1` |
| 1 | `tick :5` |

### orbit-drag

| ms | function |
| --- | --- |
| 84 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 26 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 23 | `intersectTriangle chunk-URRDWL2E.js:6584` |
| 18 | `(anonymous) @react-three_drei.js:528` |
| 13 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 12 | `setup chunk-URRDWL2E.js:32830` |
| 10 | `bindVertexArray :-1` |
| 9 | `getX chunk-URRDWL2E.js:10961` |

### focus-room

| ms | function |
| --- | --- |
| 9 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 5 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 4 | `projectObject chunk-URRDWL2E.js:41023` |
| 3 | `setValueV3f chunk-URRDWL2E.js:34601` |
| 3 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 3 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 3 | `loop chunk-TK7WHPHW.js:14152` |
| 3 | `setup chunk-URRDWL2E.js:32830` |

### wheel-zoom

| ms | function |
| --- | --- |
| 20 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 7 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 5 | `setup chunk-URRDWL2E.js:32830` |
| 4 | `copyArray chunk-URRDWL2E.js:34565` |
| 4 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 3 | `copy chunk-URRDWL2E.js:3342` |
| 3 | `upload chunk-URRDWL2E.js:35173` |
| 3 | `projectObject chunk-URRDWL2E.js:41023` |

### idle-room

| ms | function |
| --- | --- |
| 4 | `requestAnimationFrame :-1` |

### reload-layout

| ms | function |
| --- | --- |
| 727 | `texSubImage2D :-1` |
| 50 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 41 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 40 | `Blob :-1` |
| 37 | `run :-1` |
| 36 | `toDataURL :-1` |
| 23 | `GLTFBinaryExtension three_examples_jsm_loaders_GLTFLoader__js.js:1053` |
| 20 | `getProgramInfoLog :-1` |

### switch-to-studio-again

| ms | function |
| --- | --- |
| 141 | `texSubImage2D :-1` |
| 52 | `WebGLRenderer.setSize chunk-URRDWL2E.js:40556` |
| 42 | `getProgramInfoLog :-1` |
| 11 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 6 | `run :-1` |
| 5 | `update chunk-URRDWL2E.js:31899` |
| 4 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 4 | `tick :5` |

### studio-settled

| ms | function |
| --- | --- |

### walk-to-kitchen

| ms | function |
| --- | --- |
| 35 | `needsUpdate chunk-URRDWL2E.js:32900` |
| 16 | `WebGLRenderer.renderBufferDirect chunk-URRDWL2E.js:40744` |
| 11 | `exports.jsxDEV react_jsx-dev-runtime.js:238` |
| 9 | `updateMatrixWorld chunk-URRDWL2E.js:8755` |
| 9 | `tick :5` |
| 8 | `setup chunk-URRDWL2E.js:32830` |
| 6 | `prepareFreshStack chunk-RMQKLT5B.js:12094` |
| 5 | `setFromMatrix4 chunk-URRDWL2E.js:3376` |

## Files

- `cpu-<scenario>.cpuprofile.gz`: gunzip, then open in Chrome DevTools → Performance (or `chrome://inspect` → Profiler) or speedscope.app.
- `trace-<scenario>.json.gz`: Chrome trace with frames, GPU and main-thread tasks; open in Chrome DevTools → Performance → Load profile, or ui.perfetto.dev.
- `results.json`: the numbers above.
