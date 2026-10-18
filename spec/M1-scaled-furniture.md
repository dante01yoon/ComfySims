# M1 — Real-scale furniture in a room, rendered back to 2D

## Goal

A ComfyUI user installs one node pack, opens the room editor it serves, turns a product photo plus its listed
dimensions into a GLB that is exactly that size, places it in a box room, sees collisions, and sends the
layout's render passes back into a ComfyUI image workflow.

Demo sentence: *"Does this sofa fit my living room?" — answered with a real-size 3D check and a photoreal render.*

## Non-goals (M1)

- Hosted website, accounts, cloud storage, billing
- Floor plan or room photo to 3D (M2)
- Scraping retail product pages (input is image + typed dimensions)
- Non-box rooms, doors and windows (M2)

## Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-1 | active | A room layout survives serialize → parse unchanged, and invalid layouts are rejected with the failing JSON path |
| AC-2 | active | The GLB measuring tool reports size, bounds and center in centimeters for any GLB |
| AC-3 | active | `exact` fit (default) of a generated GLB yields a bounding box within ±1 cm of the listed width, depth and height |
| AC-4 | active | In every fit mode the fitted GLB has its pivot at bottom center: min y = 0 and x/z center = 0 (±0.5 cm) |
| AC-5 | active | Using listed asset dimensions (never mesh bounds), two placed items whose footprints overlap are reported as colliding; items that only touch are not |
| AC-6 | active | Using listed asset dimensions, an item whose footprint leaves the room, or whose height exceeds the ceiling, is reported as out of bounds |
| AC-7 | active | Snapping puts floor positions on a 5 cm grid (height untouched) and rotation on 15° steps normalized to [0, 360) |
| AC-8 | active | `workflows/product-to-glb.json` and `workflows/render-from-depth.json` lint clean against the pinned node catalog (classes, required inputs, link targets and types, combo values) and tag their input nodes |
| AC-9 | active | The editor exports depth (near = bright), camera-space normal and object-mask PNGs from the current camera at the requested size |
| AC-10 | manual | End to end: product photo → generated GLB → fitted to listed size → placed in a room → photoreal render from its depth pass (evidence 2026-10-18: `docs/recordings/demo-ac10.md`) |
| AC-11 | active | `uniform` fit keeps the source proportions (±0.5%) and fits inside the listed box, touching it on at least one axis (±1 cm) |
| AC-12 | active | Every fit returns a report with per-axis scale and distortion = max/min scale, flagged above 1.15 |
| AC-13 | active | Fitting never throws: unreadable files, GLBs without a scene and zero-size bounds return a failure reason and write nothing |
| AC-14 | active | The editor loads a valid layout and shows each item at its listed size and position (a box stand-in when the GLB is missing); an invalid layout is rejected with the failing path and the current layout is kept |
| AC-15 | active | Moving and rotating items in the editor snap (AC-7), and collisions and out-of-bounds (AC-5, AC-6) update and highlight live |
| AC-16 | active | Saving returns the edited layout, which passes the layout contract |
| AC-17 | active | Undo and redo cover move, rotate and remove; loading starts a fresh history; a new edit clears redo |
| AC-18 | active | The node pack fits ComfyUI MESH vertices like `fitGlb` (same sizes, pivot and report), per item of a padded batch, drops normals after non-uniform scale, and returns a reason for flat meshes |
| AC-19 | active | ComfyUI started with the node pack registers `RoomfitFitMesh` exactly as `spec/contracts/roomfit-nodes.json` says and serves the built editor at `/roomfit/` |
| AC-20 | active | `buildProductPrompt` and `buildRenderPrompt` wire inputs into the tagged nodes of a workflow without mutating it, and list every missing tag |
| AC-21 | active | A ComfyUI client uploads, queues, follows a job through its statuses and downloads saved files from local ComfyUI or Comfy Cloud, returning failures (job errors, unknown jobs, unreachable server) as data |
| AC-22 | active | GLB bytes can be fitted without a file system, with the same result as the file-based fit |
| AC-23 | active | In the editor, a product photo plus listed size becomes a placed, real-size item through ComfyUI, with visible job statuses; the saved layout reloads and re-fits it; a failed job is reported and changes nothing |
| AC-24 | active | In the editor, Render sends the depth pass and prompt to ComfyUI and shows the resulting image |
| AC-25 | active | The Comfy Cloud API key is added by the local dev server only: it never appears in browser requests or served code, and it is not forwarded to the signed storage redirect |
| AC-26 | active | The side panel exposes the product and render flows with labelled controls and a status line |
| AC-28 | active | The render result opens as a large overlay over the 3D view (at least half the viewport wide) that can be closed; while a ComfyUI job runs, the status line shows the step and elapsed seconds |
| AC-27 | manual | A screen recording of the real editor driving Comfy Cloud end to end: photo → 3D → placed → render (evidence 2026-10-18: `docs/recordings/demo-ac27-cloud-live.md`) |

## Decisions behind this spec

- Scope cut and wedge: [ADR-0001](../docs/adr/0001-m1-scope-real-scale-wedge.md)
- Listed dimensions are the truth; fitting is a visual mode (`exact` | `uniform`): [ADR-0002](../docs/adr/0002-fit-per-axis-to-listed-dimensions.md)
- Harness-first, spec-driven workflow: [ADR-0003](../docs/adr/0003-harness-first-spec-driven.md)
- Editor stack and agent-legible API: [ADR-0004](../docs/adr/0004-editor-stack-and-agent-api.md)
- Node pack, workflow contract and local ComfyUI in the harness: [ADR-0005](../docs/adr/0005-node-pack-and-workflow-contract.md)
- Editor drives ComfyUI / Comfy Cloud, key stays server-side: [ADR-0006](../docs/adr/0006-editor-drives-comfy-cloud.md)

## Spec changes

- 2026-10-18: `fitGlb` returns an outcome instead of throwing (raised by implementation session impl-01-fit, see `docs/recordings/impl-01-fit.md`). AC-13 added.
- 2026-10-18: room origin stated (floor center, raised by impl-02-placement); `no-scene` fixture added to AC-13.

## Open questions

- Front direction: ADR-0002 said −Z; the first real generated model (TRELLIS.2) faces +Z, the glTF convention. ADR corrected; no test depends on it yet. Add an AC when the editor gets a "face the room" placement default.
- Rounding parity: the Python fit rounds measured sizes to 1 µm (float32 noise) and the TypeScript fit does not (raised by impl-04-nodepack). Decide whether both round.

- Which image-to-3D model is the default local path (Hunyuan3D 2.x vs TRELLIS) — decide after a fixture comparison run.
- Front-facing detection: assume the product photo is a front shot for M1, or add a rotate control in the editor?

## Interface for AC-3, AC-4, AC-11, AC-12, AC-13

Implementation lives in `packages/fit/src/index.ts` and is pure apart from GLB file IO:

```ts
type FitMode = 'exact' | 'uniform'
type FitReport = {
  mode: FitMode
  scale: { x: number; y: number; z: number }
  distortion: number
  flagged: boolean
}
type FitOutcome =
  | { ok: true; report: FitReport }
  | { ok: false; reason: 'unreadable' | 'no-scene' | 'degenerate-bounds' }
fitGlb(input: { source: string; target: string; dimensions: Dimensions; mode?: FitMode }): Promise<FitOutcome>
```

`dimensions` is the layout contract's `Dimensions` (cm). `source` and `target` are GLB file paths. `mode` defaults to `exact`.
The Python node pack must produce the same output for the same fixtures (planned, M1 node pack AC).

## Interface for AC-5, AC-6, AC-7

Implementation lives in `packages/placement/src/index.ts`, pure functions only, no three.js:

```ts
collisions(layout: RoomLayout): { a: string; b: string }[]
outOfBounds(layout: RoomLayout): { itemId: string; reason: 'outside-room' | 'above-ceiling' }[]
snapPosition(position: { x: number; y: number; z: number }, stepCm?: number): { x: number; y: number; z: number }
snapRotation(degrees: number, stepDegrees?: number): number
```

- Footprints are the listed `width` × `depth` rotated by `rotationY` around the item position (degrees, counter-clockwise seen from +Y, same as three.js `rotation.y`). Exact rotated rectangles, not their bounding boxes.
- Touching is not colliding and not out of bounds (tolerance 0.001 cm).
- `collisions`: each pair once, `a < b` by id, list sorted by `a` then `b`. `outOfBounds`: one entry per item and reason, `outside-room` before `above-ceiling`.
- Snapping rounds half up (`Math.round`) and never returns `-0`. Default steps: 5 cm, 15°.

## Editor (AC-9, AC-14 ~ AC-17)

- Lives in `web/` (Vite + React + react-three-fiber, see ADR-0004). `pnpm web:dev` serves it on port 5179 and must also serve the repo's `fixtures/` folder at `/fixtures/`.
- Implements `RoomfitEditorApi` from `spec/contracts/editor-api.ts` on `window.roomfit`. Every UI action (drag, rotate handle, delete key) goes through the same functions, so the e2e tests exercise what users do.
- Coordinates: the room's floor center is the origin, Y up, all API values in cm (`rotationY` in degrees, three.js direction).
- The room renders floor and walls, no ceiling. Items render their GLB (`asset.uri`, already fitted, pivot bottom center); if it fails to load, a box of the listed dimensions stands in and `meshLoaded` is `false`.
- Collisions and bounds always come from `packages/placement`, never from mesh bounds. Highlighted items are the ones in `collisions` or `outOfBounds`.
- Camera: perspective, vertical FOV 50°. `exportPasses` renders from the current camera at the requested size:
  - `depth`: grayscale, linear between nearest and farthest rendered point, near = 255
  - `normal`: camera-space normals as RGB = (n + 1) / 2, so a surface facing the camera is (128, 128, 255)
  - `mask`: items white (255), everything else black (0)

## Node pack, workflows and prompt builders (AC-8, AC-18 ~ AC-20)

**Node pack** — `nodes/roomfit/` is a ComfyUI custom node folder.
- `fit.py`: `fit_mesh(mesh: Types.MESH, dimensions: {"width","depth","height"} in cm, mode: "exact" | "uniform")` returns `{"ok": True, "mesh": MESH, "reports": [FitReport, ...]}` (one report per batch item, same keys as the TypeScript `FitReport`) or `{"ok": False, "reason": "degenerate-bounds", "index": i}`. Never mutates its input. MESH vertices are meters (what `SaveGLB` writes); same frame as ADR-0002. Padded batches: only the first `vertex_counts[i]` rows of item `i` are read and moved. Normals are set to `None` after a non-uniform scale and kept after a uniform one; every other MESH field is carried over.
- `__init__.py`: registers `RoomfitFitMesh` exactly as `spec/contracts/roomfit-nodes.json` (the node raises `ValueError(reason)` on a failed fit; `fit_report` output is the reports list as JSON), and serves `nodes/roomfit/editor/` (built by `pnpm web:build:nodepack`, git-ignored) at `/roomfit/` through ComfyUI's `PromptServer` routes.
- Python acceptance tests run in the ComfyUI venv (`ROOMFIT_COMFYUI_DIR`, default `~/Desktop/github/ComfyUI`); AC-19 starts that ComfyUI on CPU with `--base-directory .harness/comfy-base` so the checkout itself is never modified.

**Workflows** — ComfyUI API-format JSON in `workflows/`. Input nodes carry `_meta.title` tags:
- `product-to-glb`: `roomfit:product-image` (LoadImage), `roomfit:seed` (KSampler), `roomfit:fit` (RoomfitFitMesh), `roomfit:save` (SaveGLB fed by the fit). Local path: Hunyuan3D 2 (`ImageOnlyCheckpointLoader` → `CLIPVisionEncode` → `Hunyuan3Dv2Conditioning` → `KSampler` → `VAEDecodeHunyuan3D` → `VoxelToMesh`).
- `render-from-depth`: `roomfit:depth` (LoadImage of the depth pass), `roomfit:positive` / `roomfit:negative` (CLIPTextEncode), `roomfit:seed` (KSampler), `roomfit:save` (SaveImage), through a depth ControlNet.
- Model file names are not checked by the lint (the local catalog has none installed); the AC-10 demo pins them.
- Catalog: `spec/contracts/comfyui-object-info.json`, regenerated in a spec session with `pnpm comfy:snapshot <object_info.json>`.

**Prompt builders** — `packages/comfy/src/index.ts`, pure:

```ts
type PromptOutcome = { ok: true; prompt: ApiWorkflow } | { ok: false; missing: string[] }
buildProductPrompt(workflow, { imageName, dimensions, mode, seed }): PromptOutcome
buildRenderPrompt(workflow, { depthImageName, prompt, negativePrompt, seed }): PromptOutcome
```

`ApiWorkflow` is the type in `harness/tools/lint-workflow.ts`. `missing` lists absent tags in the order the builder needs them (product: image, fit, seed; render: depth, positive, negative, seed).

## Editor ↔ ComfyUI / Comfy Cloud bridge (AC-21 ~ AC-27)

**Client** — `packages/comfy/src/index.ts` adds, pure apart from `fetch`:

```ts
createComfyClient({ baseUrl, fetch?, pollMs? }): {
  upload(file: Blob, fileName: string): Promise<{ ok: true; name: string } | Failure>
  queue(prompt: ApiWorkflow): Promise<{ ok: true; id: string } | Failure>
  waitForJob(id, { onStatus?, signal? }?): Promise<{ ok: true; outputs: Record<string, unknown> } | Failure>
  download(file: { filename: string; subfolder: string; type: string }): Promise<{ ok: true; bytes: Uint8Array } | Failure>
}
buildPhotoTo3dPrompt(workflow, { imageName, seed }): PromptOutcome   // tags: roomfit:product-image, roomfit:seed, roomfit:save
savedFiles(prompt, outputs): { filename, subfolder, type }[]          // files of the node tagged roomfit:save ("3d" or "images")
```

- Endpoints (same on local ComfyUI and Comfy Cloud v1): `POST /api/upload/image` (multipart `image`, `type=input`, `overwrite=true`), `POST /api/prompt` `{ prompt }` → `prompt_id`, `GET /api/jobs/{id}` (`pending | in_progress | completed | failed | cancelled`, `outputs`, `execution_error.exception_message`), `GET /api/view?filename&subfolder&type`. A 404 on `/api/jobs/{id}` falls back to `GET /api/history/{id}` for older local ComfyUI.
- `Failure` = `{ ok: false; reason: 'unreachable' | 'http' | 'rejected' | 'failed' | 'cancelled'; message }`.

**Fit in the browser** — `packages/fit` adds `fitGlbBytes(bytes, dimensions, mode)` → `{ ok: true; bytes; report } | { ok: false; reason }`; `fitGlb` becomes a file wrapper around it.

**Editor** (contract: `addProductFromPhoto`, `renderInComfy`, `state().jobs`, `state().lastRender`):
- ComfyUI base URL: `''` when the editor is served from the node pack under `/roomfit/` (same origin), `/comfy` otherwise.
- Product flow: upload photo → `workflows/cloud/product-to-glb-pixal3d.json` via `buildPhotoTo3dPrompt` → wait → download the saved GLB → `fitGlbBytes` with the listed size (default `exact`) → new asset `{ uri: 'comfy-output:<subfolder>/<filename>', dimensions, fit: { mode, distortion } }` and an item at the room center (snapped). Statuses in order: uploading, queued, in_progress, downloading, fitting, done (or failed with the ComfyUI message). Nothing is added on failure.
- `comfy-output:` URIs are resolved through `/api/view` and re-fitted on load (fitting is a pure function of source, size and mode).
- Render flow: `exportPasses` depth at the requested size (default 1152×896) → upload → `workflows/render-from-depth.json` via `buildRenderPrompt` → wait → download → `lastRender` (data or blob URL).
- Side panel: "Product photo" (file), "Product name", "Width (cm)", "Depth (cm)", "Height (cm)", fit mode, button "Generate 3D", a `role="status"` line ("Placed" when done), "Render prompt", button "Render", and the result as an image named "Render result".

**Dev server proxy** — `pnpm web:dev` proxies `/comfy/*` to `ROOMFIT_COMFY_URL` (default `http://127.0.0.1:8188`) and adds `X-API-Key: $COMFY_CLOUD_API_KEY` when set (read from the environment or `.env.local`, never from `VITE_*`). For `/api/view` it follows the 302 itself, without the key, and streams the bytes back.

**Harness** — `harness/tools/fake-comfy.mjs` stands in for Comfy Cloud (records requests, requires the key, answers jobs, redirects views to a fake storage server). Playwright starts it next to the dev server with a test key.

**Cloud workflow** — `workflows/cloud/product-to-glb-pixal3d.json` is the API graph Comfy Cloud ran for the `3d_pixal3d_trellis2_image_to_model` template (Pixal3D branch), with preview-only nodes removed, `SaveGLB` instead of `Save3DAdvanced` (known `"3d"` output shape) and texture size 2048. Verified on Cloud 2026-10-18 (job `ad9f4464-53e9-4b62-937b-2b70f5192b8d`). Not linted against the local catalog: Cloud runs nodes the local checkout lacks.

**Panel layout (AC-26, AC-28, checked by screenshot):** every control sits under its own label in one column; the size fields share one row; the status line reads like "Generating 3D on ComfyUI… 42 s" / "Fitting to 200 × 90 × 85 cm" / "Placed — distortion 1.16 (flagged)". The render result overlay has a "Close" button and shows the prompt underneath the image.
