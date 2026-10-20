# How performance is measured, and how improvement points were found

This is the method behind every run in this folder. Results are in each run's `report.md`; the story is in [the case study](../smooth-motion-case-study.md).

## Test environment

| | |
| --- | --- |
| Machine | Apple M4 Max, 36 GB, macOS 26.5.2 (25F84) |
| Browser | Playwright Chromium 141.0.7390.37 |
| GPU path | real GPU through ANGLE Metal (`--use-angle=metal --enable-gpu --ignore-gpu-blocklist`), confirmed per run via `WEBGL_debug_renderer_info` ("ANGLE Metal Renderer: Apple M4 Max") |
| Mode | **headless**, so no window and no focus stealing. This also pins the frame clock at 60 Hz. Headful runs drifted between 60 and 120 Hz depending on which display the window opened on. |
| Audio | muted (`--mute-audio`) |
| Throttling off | `--disable-renderer-backgrounding --disable-background-timer-throttling` |
| Viewport | 1600 × 900 CSS px at device pixel ratio 2 (3200 × 1800 drawing buffer), like a Retina laptop |
| App build | Vite dev server (development React). Each version is served from its own checkout: before = a `git worktree` at the pre-change commit on port 5189, after = the working tree on 5179. |
| Data | the 17-piece demo house from the agent recording (`demo/out/agent/final-state.json`). Every piece is a real Comfy Cloud image-to-3D output, 205 MB of GLB in total, served locally by `demo/serve-assets.mjs`. |
| Repeats | 3 runs per version, each in a fresh browser; reports show the **median** and, for stalls, the min–max range. Profiles and traces come from run 1. |

This is a best case: a top-end laptop GPU and a local network. An ordinary laptop is slower, and a real network adds download time.

## Scenarios

Each scenario is one measurement window:

| Scenario | What happens |
| --- | --- |
| `load-layout` | load the house JSON and wait until every mesh is loaded |
| `switch-to-studio` | editor → studio view, 2 s |
| `idle-house` | nothing, 3 s |
| `orbit-drag` | a 3 s mouse orbit plus 1 s to coast |
| `focus-room` | focus the bedroom, 2 s |
| `wheel-zoom` | 20 wheel ticks plus 1 s |
| `idle-room` | nothing, 3 s |
| `walk-to-kitchen` | only when walk mode exists: hold W for 2.5 s through the kitchen door |

## What is recorded per scenario

| Signal | How |
| --- | --- |
| Frame timing | a `requestAnimationFrame` loop in the page records every frame timestamp → fps, p50/p95 frame gap, frames over 33 ms |
| Main-thread stalls | `PerformanceObserver({ type: 'longtask' })` → count and longest (> 50 ms) |
| Camera motion | the on-screen camera position every frame (`cameraFrame()`, else `camera()`) → largest step in one frame (teleports, hitches during glides) |
| Frames actually rendered | `renderStats().frames` (from M15) → proves render-on-demand |
| CPU | V8 sampling profiler via CDP (`Profiler.start/stop`) → `cpu-<scenario>.cpuprofile.gz`; top self-time functions in the report; GC time |
| Timeline | Chrome trace via CDP (`Tracing.start`, categories `devtools.timeline`, `…timeline.frame`, `gpu`, `v8.execute`, `blink.user_timing`, `loading`) → `trace-<scenario>.json.gz` |
| Memory | `Runtime.getHeapUsage` before/after → JS heap and its change |
| Flame graph | `demo/flamechart.mjs` turns each CPU profile into `flamegraph-<scenario>.svg` (stacks merged, width = time) |
| Flame chart | the same script also writes `flamechart-<scenario>.svg` (time on x, stack downwards) |
| Bundle | `demo/measure-bundle.mjs`: production build with source maps → `source-map-explorer` → `bundle.md` (size per package) |

Colours in the flame SVGs:
- **Red:** GPU uploads, shader compile and canvas resize (`texSubImage2D`, `getProgramInfoLog`, `setSize`).
- **Amber:** GLB parsing and fitting.
- **Green:** React and three's render loop.

## Reading the raw files

- `trace-*.json.gz`: gunzip, then Chrome DevTools → Performance → "Load profile…", or drop it on https://ui.perfetto.dev.
- `cpu-*.cpuprofile.gz`: gunzip, then DevTools → Performance → load, or https://www.speedscope.app.
- `results.json`: every run's numbers, not only the median.

## How the improvement points were found (M15 → M16)

1. **Classify the jank first.** The before-run showed 60 fps whenever nothing loaded. So the problem was not steady frame rate but three other things:
   - **Teleports:** the camera moved 17 m in one frame on focus.
   - **Stalls:** 150–250 ms long tasks on load and on view switch.
   - **No inertia and no walking:** a matter of design, not measurement.
2. **Teleports → M15.** The camera-step metric pointed straight at `focusZone`/`setView`, which set the camera directly. The fix was a design change (ADR-0013), not a speed-up.
3. **Stalls → read the flame graphs.**
   - `load-layout` (flame graph): most main-thread time is red `texSubImage2D`, reached through two paths.
     - The scene render loop uploads each piece's textures.
     - `AssetCard → useMemo → thumbnailOf → WebGLRenderer.render`. The library renders every asset's 3D thumbnail synchronously **inside React's render**, and each thumbnail render uploads that asset's 2048² textures again. This second path was found only by reading the flame graph; the self-time table had shown just `texSubImage2D`.
   - `switch-to-studio` (flame chart): a wide red `WebGLRenderer.setSize` under r3f's `configure` in a React layout effect. The canvas changes size between views, so every render target (shadow map, N8AO buffers) is reallocated. Smaller red `texSubImage2D` and shader-compile blocks follow.
4. **Why the textures are expensive.** Inspecting the GLBs (header parse, image dimensions) showed every piece carries ~120k triangles and three 2048² PNGs. That is ~48 MB of GPU memory per piece, ~800 MB for the house. That is the root cause behind both uploads.
5. **Turn findings into targets.** Each cause got a spec rule and a number (M16):
   - optimise meshes and textures at fit time;
   - do it in a worker;
   - cache the results;
   - at most 2 texture uploads per frame;
   - keep the canvas size stable;
   - compile shaders ahead;
   - move thumbnails out of React render and cache them.
6. **Measure again the same way.** The after-run is compared only against the before-run made under the same conditions.
7. **Read the after-run too.** The M15 after-run's `wheel-zoom` showed 0 camera movement and 0 frames. A probe found that a room label at the screen centre swallowed wheel events — a regression no test covered (AC-124).

## Reproduce

```bash
node demo/serve-assets.mjs
```

```bash
ROOMFIT_COMFY_URL=http://127.0.0.1:8199 pnpm web:dev
```

```bash
MOTION_LABEL=2026-10-19-m15-after node demo/measure-motion.mjs
```

```bash
node demo/flamechart.mjs docs/portfolio/perf/2026-10-19-m15-after
```

```bash
MOTION_LABEL=2026-10-19-m15-after node demo/measure-bundle.mjs
```

For a "before" run, check out the earlier commit with `git worktree add`, serve it on another port, and pass `MOTION_URL` and `MOTION_COMMIT`.
