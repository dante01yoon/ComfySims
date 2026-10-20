# M16 — Light assets, no stalls: optimise generated furniture off the main thread

| | |
| --- | --- |
| Status | Approved (2026-10-19) |
| Date | 2026-10-19 |
| Owner | Dante |
| Decisions | [ADR-0014](../docs/adr/0014-optimise-generated-meshes-before-fitting-in-a-worker.md) |
| Case study | [docs/portfolio/smooth-motion-case-study.md](../docs/portfolio/smooth-motion-case-study.md) |

## 1. Why

**M15 made the camera smooth, but loading and switching views still freeze the screen.** Measured after M15 (`docs/portfolio/perf/2026-10-19-m15-after`, median of 3 headless runs on an M4 Max):

| Moment | Longest stall | Where the time goes (V8 CPU profile) |
| --- | --- | --- |
| Loading the 17-piece house | 105 ms (95–274) | `texSubImage2D` ~0.9 s in total: uploading 45 textures of 2048² to the GPU on the main thread; GLB parsing; fitting |
| Switching editor → studio | 131 ms (110–158) | `WebGLRenderer.setSize` (render targets reallocated because the canvas changes size), texture uploads, synchronous shader compile checks |

The flame graph of the load (`perf/2026-10-19-m15-before/flamegraph-load-layout.svg`) shows the uploads come from two paths:
- the scene render;
- `AssetCard → useMemo → thumbnailOf → WebGLRenderer.render`. The library renders every asset's 3D thumbnail synchronously inside React's render, uploading that asset's textures a second time.

The root cause is the generated assets. Every piece from image-to-3D comes out the same way:

- **Geometry:** ~120,000 triangles.
- **Textures:** three 2048² PNGs.
- **File size:** 7–17 MB.
- **GPU memory:** about 48 MB.

A furnished house is 205 MB of GLB and ~800 MB of texture memory. That is far more than a piece seen across a room needs, and on an ordinary laptop it is worse than these best-case numbers.

## 2. Goals and non-goals

Goals
- Every generated GLB is optimised once, when it is fitted:
  - Fewer triangles, keeping the silhouette.
  - Textures sized to the piece.
- The optimised GLB is what the editor keeps, shows and saves.
- Fitting and optimising run in a Web Worker, so the main thread never parses or rewrites a GLB.
- Optimised GLBs are cached in the browser (IndexedDB), so reloading a house downloads and processes nothing twice.
- Textures reach the GPU a few per frame, never all at once.
- Library thumbnails render outside React's render, one per frame at most, and are cached with the asset.
- Switching views does not resize the canvas.
- The viewers that are not on screen at startup load on demand (smaller first bundle).
- `renderStats()` reports draw calls, triangles and estimated texture memory, for the perf tooling.

Non-goals (M16)
- GPU-compressed textures (KTX2/Basis). Better for memory but needs a ~2 MB WASM encoder and seconds per texture; recorded in the ADR as the next step.
- Re-optimising assets already in a saved layout's files on disk (they are optimised when loaded and cached).
- Level of detail switching by distance.
- The Python node pack (its fitted mesh still goes through the editor, which optimises it).

## 3. Scenarios

1. **Generate.** Dante generates a sofa on Comfy Cloud. The job card shows "Optimising" for about a second, then "Fitting". The sofa appears at exact size, about 1 MB instead of 14 MB, and the editor never stutters while it happens.
2. **Reload.** Dante reloads the page with the furnished house. Every piece comes from the browser cache. Nothing is downloaded or optimised again, the house appears without a freeze, and textures stream in over a few frames.
3. **Switch.** He switches from the editor to the studio. There is no freeze; the camera glides (M15) without a hitch.

## 4. Screens and states

- The product job card gains an "Optimising" step between "Downloading" and "Fitting".
- No other UI changes.

## 5. Behaviour rules

- **Pipeline, in a Web Worker:**
  1. Read the GLB.
  2. Optimise it.
  3. Align and fit as before (`packages/fit`, AC-36/37).
  4. Write the GLB.
  - Optimising before fitting keeps the fit exact: the listed size is applied to the optimised mesh.
- **Optimise, in `packages/fit`:**
  - Weld duplicate vertices, then simplify. The target is 25,000 triangles per piece. A piece already below that is unchanged.
  - The simplifier may move vertices by at most 0.5% of the piece's largest dimension, so the silhouette and bounds hold.
  - Drop unused data (prune, dedup).
  - Resize every texture to the piece's texture size:
    - 1024² when the largest listed dimension is ≥ 100 cm, otherwise 512².
    - Never upscale; keep the aspect ratio for non-square textures.
  - Re-encode textures as WebP (`EXT_texture_webp`). Normal maps keep 8 bits per channel.
  - Image resizing is a function the caller provides: OffscreenCanvas in the worker, a fake in unit tests.
- **Report:** the fit report gains `optimised: { trianglesBefore, trianglesAfter, bytesBefore, bytesAfter, textureSizeBefore, textureSizeAfter }`. It is stored on the asset's `fit`, which the schema already allows to grow (`fit` is extended, optional).
- **Off the main thread:**
  - The editor sends GLB bytes to `web/src/fit.worker.ts` and gets the fitted bytes back, as a transferable `ArrayBuffer`.
  - The main thread never calls `fitGlbBytes` or `optimizeGlb`.
  - `renderStats().mainThreadFits` counts main-thread fits and must stay 0.
- **Cache:**
  - IndexedDB store `comfysims-assets`.
  - Key: source URI or content hash, plus listed size, fit mode, alignment flag and optimiser version.
  - Value: the fitted GLB bytes and the report.
  - Loading a layout checks the cache before downloading.
  - `clearAssetCache()` empties it.
  - A cache failure (private mode, quota) falls back to processing; it is never an error.
- **Progressive upload:** after a GLB is parsed, its textures are uploaded to the GPU with at most 2 texture uploads per frame (`renderer.initTexture`). Until a piece's textures are on the GPU it shows its box stand-in.
- **Thumbnails:**
  - A library card shows the asset's cached thumbnail (data URL, ≤ 40 KB; a product photo when there is one).
  - Missing thumbnails are rendered by a queue outside React's render, at most one per frame, and saved on the asset.
  - `renderStats().thumbnailRenders` counts them.
- **Stable canvas:** the main canvas keeps its size when switching between editor and studio. Panels overlay it; they do not resize it.
- **Shaders:** the studio's materials are compiled ahead (`renderer.compileAsync`) while the editor view is idle after load, so the first switch does not compile them.
- **Code split:** the 360° viewer and the 3D-photo viewer are lazy chunks. The first JS chunk is ≤ 1,100 KB minified.
- **renderStats():** `{ frames, drawCalls, triangles, geometries, textures, textureBytes, mainThreadFits, thumbnailRenders }`. `textureBytes` = Σ width × height × 4 × 4/3 over GPU textures.

## 6. Contract and data changes

- `spec/contracts/editor-api.ts`:
  - `renderStats()` gains the fields above.
  - New `assetStats(assetId): { triangles: number; textures: { width: number; height: number }[]; bytes: number } | null`.
  - New `clearAssetCache(): Promise<void>`.
- `packages/schema`: `AssetFit` gains optional `optimised`.
- `packages/fit`: new `optimizeGlb(document, options)`; `fitGlbBytes` takes `{ optimise?: { resizeImage } }`.
- New dependencies: `@gltf-transform/functions` and `meshoptimizer` (MeshoptSimplifier, WASM, works in workers).

## 7. ComfyUI workflows

None.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-125 | planned | `optimizeGlb` on the heavy fixture (119,600 triangles, three 2048² textures): ≤ 25,000 triangles, bounds within 0.5% of the largest dimension, textures resized by the given resizer to 1024 (≥ 100 cm) or 512, and a report with before/after counts; a mesh already under the budget is unchanged |
| AC-126 | planned | Fitting after optimising keeps AC-3/AC-4: the optimised heavy fixture fitted to 70 × 80 × 75 cm is within ±1 cm and bottom-centred |
| AC-127 | planned | In the editor, a product whose ComfyUI output is the heavy fixture becomes an asset with ≤ 25,000 triangles, WebP textures ≤ 512² (it is under 100 cm), a GLB at least 80% smaller, and `mainThreadFits` stays 0 |
| AC-128 | planned | Reloading the same layout downloads no GLB again (request count 0 for asset URLs) and its pieces load from the cache; `clearAssetCache()` makes the next load download again |
| AC-129 | planned | Switching editor ↔ studio keeps the canvas size; the 360° and 3D-photo viewers are separate chunks and the first chunk is ≤ 1,100 KB |
| AC-130 | planned | `renderStats()` reports draw calls, triangles, textures and texture bytes, and texture bytes for the demo house with the heavy fixture as every piece is ≤ 25% of the same house unoptimised |
| AC-132 | planned | Library thumbnails: loading a layout whose assets already have thumbnails renders none (`thumbnailRenders` unchanged); missing ones render at most one per animation frame, outside React render, and are saved on the asset |
| AC-131 | manual | Real-GPU measurement (median of 3 headless runs): loading the 17-piece demo house and switching to the studio have no main-thread stall over 50 ms after the first load (cached) and none over 100 ms on the first load; evidence in the case study |

## 9. Test plan

| AC | Level |
| --- | --- |
| AC-125, AC-126 | vitest (`packages/fit`), heavy fixture `fixtures/glb/heavy-generated.glb` (built by `harness/tools/build-heavy-fixture.ts`), a fake resizer that records sizes |
| AC-127 ~ AC-130, AC-132 | e2e: the fake ComfyUI returns the heavy fixture when asked (`/__product-glb?fixture=heavy-generated.glb`, restored after each test) |
| AC-131 | manual: `demo/measure-motion.mjs` before/after |

## 10. Risks and open questions

- Simplifying UV seams can smear textures. Use `meshopt` with the "lock border" flag and accept some visible error; check the real armchair by eye in the recording.
- WebP encoding in OffscreenCanvas is not available in every browser (Safari encodes WebP since 17). Fall back to PNG at the reduced size.
- IndexedDB quota on huge libraries: entries are ~1 MB, so hundreds fit; evict least-recently-used beyond 500 MB.

## Change log

- 2026-10-19 Written from the M15 measurements; approved under Dante's "계속 진행해" with the targets set in the case study.
