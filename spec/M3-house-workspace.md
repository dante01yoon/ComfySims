# M3 — House workspace: Comfy job panel, labelled rooms with an asset library, 3D photos

| | |
| --- | --- |
| Status | Approved (2026-10-18) |
| Date | 2026-10-18 |
| Owner | Dante |
| Decisions | [ADR-0008](../docs/adr/0008-job-model-and-3d-photos.md) |

## 1. Why

**Comfy work is invisible and serial.** A product takes ~60 s on Comfy Cloud, a room render ~15 s. Today the editor keeps `state().jobs` as a flat log of status events, shows only the latest one in a single status line, disables Generate and Render while anything runs, and works out elapsed time from positions in that log. With 15 pieces of furniture to generate, the user cannot see what is running, what finished, or what failed, and cannot start a render while a model generates. Evidence: the 15-piece batch (2026-10-18) had to be driven by a script because the editor runs one job at a time.

**The house has rooms, but the editor does not let you work room by room.** Rooms appear only as chips under the studio. Assets that already exist (the 15 Cloud-generated pieces, uploads) can only be placed by loading a layout file; there is no library and no "put this in the bedroom". Rooms cannot be renamed.

**Renders are flat.** An eye-level room render (AC-46) is a 2D image. Comfy Cloud's MoGe can turn one image into a textured 3D mesh, which gives a "3D photo" you can look around in. The same works for a real photo of a room. Feasibility checked on Cloud: job `17f5c779-5840-4bde-a98b-4e9367f35926` turned the living-room render into a 12.5 MB textured GLB in under a minute; parallax works for small head movements; depth edges tear (black gaps behind the sofa back), so the viewer must limit how far you can turn.

## 2. Goals and non-goals

Goals
- Every Comfy job is a visible card in a jobs panel, with its steps, elapsed time, expected time, result and actions; several jobs can run at once.
- Rooms are labelled in 3D, can be renamed, and are the target for placing assets from a library.
- Any finished room render, or a real photo the user uploads, can be opened as a 3D photo.

Non-goals (M3)
- Percent progress from Comfy websockets (Cloud v1 `/api/jobs` reports state only). Cards show step, elapsed and expected time instead.
- Cancelling jobs on Comfy Cloud.
- Persisting jobs or the asset library across page reloads (the layout keeps assets; jobs live in memory).
- Drag and drop from the library into the 3D view (buttons first).
- Placing a 3D photo inside the house or aligning it with the floor plan.
- Gaussian splats or multi-view reconstruction of real rooms.

## 3. Scenarios

1. **Furnish while rendering.** Dante has the demo house open in the studio. He starts "Generate 3D" for a lamp in the office, then immediately clicks Living → "Render this view". The jobs panel shows two cards running side by side; the render finishes first and its card shows a thumbnail; the lamp card later says "Placed in Office".
2. **Recover from a failure.** A product job fails on Cloud. Its card turns red with the Comfy error message and a Retry button. Retry starts a new job with the same inputs; the layout was never changed by the failed one.
3. **Put an existing piece in another room.** In the library Dante finds "Armchair · 80 × 80 × 80 cm · Cloud-generated · uniform", chooses "Place in → Bedroom". The armchair appears against a bedroom wall facing the room. If the bedroom has no space, he sees "No space in Bedroom" and nothing changes. Undo removes it.
4. **Label rooms.** Every room shows a floating label "Bedroom · 4 items". Clicking it focuses the room. Double-clicking lets Dante rename "Office" to "Studio"; the chip, label and saved layout follow; Undo restores the name.
5. **Walk into a render.** From a finished render card (or the render overlay) Dante clicks "View as 3D photo". A new job card "3D photo · Living" runs (~30 s), then a full-screen viewer opens on the room; dragging turns the view a little; "Back" closes it.
6. **Real room photo.** Dante uploads a phone photo of his real living room with "Room photo → 3D". It runs as a job and opens in the same viewer. The panel notes that the photo is sent to the configured ComfyUI (Cloud).

## 4. Screens and states

```
┌───────────────────────────────────────────────┬──────────────────────────┐
│                                               │ Jobs (2 running)      ▾  │
│        3D view (studio or editor)             │ ┌──────────────────────┐ │
│                                               │ │ ◐ Room render · Living│ │
│     [Bedroom · 4 items]   [Office · 3 items]  │ │ generating  12 s/~15 s│ │
│                                               │ └──────────────────────┘ │
│     [Living · 4 items]   [Kitchen & dining…]  │ ┌──────────────────────┐ │
│                                               │ │ ◐ 3D model · Lamp     │ │
│                                               │ │ queued  3 s / ~60 s   │ │
│                                               │ └──────────────────────┘ │
│                                               │ ┌──────────────────────┐ │
│                                               │ │ ✓ 3D photo · Living   │ │
│                                               │ │ [thumb] Open          │ │
│                                               │ └──────────────────────┘ │
│                                               ├──────────────────────────┤
│                                               │ Library (16)          ▾  │
│                                               │ Armchair 80×80×80  Place▾│
│                                               │ …                        │
│                                               │ Room photo → 3D  [file]  │
│ [Living][Kitchen]…  [Reading][Work]…[Render]  │                          │
└───────────────────────────────────────────────┴──────────────────────────┘
```

**Workspace rail** (right, 320 px, both views; in the studio it replaces nothing because the editor side panel is hidden there). Toggle button "Workspace" collapses it. Two sections:

Jobs section (heading "Jobs", with "(n running)" when any run)
- One card per job, newest first. Card title: "3D model · <product name>", "Room render · <room or 'House'>", "3D photo · <room of the source render, or House, or the uploaded file name>".
- Step line: one of `uploading`, `queued`, `generating`, `downloading`, `fitting` (product), `meshing` (3D photo), `done`, `failed`, plus elapsed seconds and, while running, "~N s" expected.
- Indeterminate progress bar while running.
- Done: thumbnail (render image; product photo; 3D photo source image) and actions — product: "Show" (focuses its room, selects the item); render: "Open" (render overlay), "View as 3D photo"; 3D photo: "Open".
- Failed: card marked as failed, the Comfy message, "Retry".
- "Clear finished" removes done and failed cards.
- Empty state: "No jobs yet. Generate a product or render a room."

Library section (heading "Library (n)")
- One row per asset in the layout: name, "W × D × H cm", source ("Cloud" for `generated`, "Upload"), fit mode when present, and a 64 px thumbnail rendered locally from its model (box icon while loading or when the model is missing).
- "Place in" button with a room menu (focused room first). Result: placed (the new item is selected and its room focused) or the message "No space in <room>".
- "Room photo → 3D" file input (label "Room photo") with the note "The photo is sent to your ComfyUI to build the 3D photo."
- Empty state: "No assets yet."

**Room labels** (3D overlay, both views, plan rooms only): one label per zone at the zone's polygon centroid on the floor, text "<name> · <n> items" ("1 item" when n = 1; n = items whose position is inside the zone), clickable to focus; double-click opens an inline text field (label "Room name"), Enter saves, Escape cancels. When a room is focused the other labels dim.

**3D photo viewer** (full-screen overlay above the 3D view): the mesh lit flat (texture only), camera starting at the photo's camera; drag turns yaw within ±20° and pitch within ±10°; wheel moves forward/back within 0–40 % of the scene depth; "Back" button; caption with the source ("Render · Living, evening" or the file name). Loading state while the GLB downloads.

## 5. Behaviour rules

- Jobs: each `addProductFromPhoto`, `renderInComfy`, `photo3d` call creates exactly one job with a stable `id`. Up to 3 jobs run at once (`MAX_CONCURRENT_JOBS = 3`); further ones wait in `queued` locally until a slot frees. Controls are never disabled because another job runs.
- Each status change appends `{ status, at }` to the job's `steps` (ms since epoch); elapsed = now − first step; finished jobs stop the clock.
- Expected seconds = median duration of earlier finished (done) jobs of the same kind in this session; defaults before any: product 60, render 15, photo3d 30.
- Retry creates a new job with the same request; the failed card stays until cleared.
- Product jobs place the item at the end (as today); if placement fails (`no-space`), the job ends `failed` with "No space in <room>" and the layout is unchanged.
- `placeAsset(assetId, zoneId?)`: zone = argument ?? focused zone ?? the zone containing the room centre; uses `findSpot`; creates one undo step; selects the new item; fails with `unknown-asset`, `unknown-zone` or `no-space` and changes nothing.
- `renameZone(zoneId, name)`: trims; empty names are rejected; one undo step; layout contract unchanged (zones already have `name`).
- Room item count: items whose footprint centre lies inside the zone polygon (point in polygon, not bounding box).
- 3D photo: source `{ kind: 'render', jobId }` uses that job's image (already on the ComfyUI side when possible, otherwise re-uploaded); source `{ kind: 'upload', fileName, imageBase64 }` uploads it. Runs `workflows/cloud/photo-to-3d-moge.json`, downloads the GLB, opens the viewer when done (if the user has not opened something else since).
- The render overlay gains a "View as 3D photo" button for its image.

## 6. Contract and data changes

`spec/contracts/editor-api.ts` — **breaking for `state().jobs`**:

```ts
// packages/schema/src/domain.ts (contract package, protected, AC-38 gate)
type JobKind = 'product' | 'render' | 'photo3d'
type JobStep = 'uploading' | 'queued' | 'generating' | 'downloading' | 'fitting' | 'meshing' | 'done' | 'failed'
type Job = { id; kind; title; steps: { status: JobStep; at: number }[]; message?; result?: { image?; glb?; itemId? } }
type Photo3dSource = { kind: 'render'; jobId: string } | { kind: 'upload'; fileName: string; imageBase64: string }
const MAX_CONCURRENT_JOBS = 3
const DEFAULT_EXPECTED_SECONDS = { product: 60, render: 15, photo3d: 30 }

// spec/contracts/editor-api.ts
state().jobs: Job[]                                   // was: one entry per status change
state().photoViewer: { jobId; yawDegrees; pitchDegrees } | null
addProductFromPhoto(...) / renderInComfy(...)          // ok results gain jobId; ComfyFailure gains jobId?
placeAsset(assetId, zoneId?): { ok: true; itemId } | { ok: false; reason: 'unknown-asset' | 'unknown-zone' | 'no-space' }
renameZone(zoneId, name): { ok: true } | { ok: false; reason: 'unknown-zone' | 'empty-name' }
photo3d(source: Photo3dSource): Promise<{ ok: true; jobId; glb } | ComfyFailure>
retryJob(jobId): Promise<{ ok: true; jobId } | ComfyFailure>   // the editor keeps each job's request internally
openPhoto3d(jobId): void
closePhoto3d(): void
```

Pure helpers (implementation packages, tested directly): `expectedSeconds(jobs, kind)` in `packages/comfy`, `itemsInZone(layout, zoneId)` (point in polygon) in `packages/placement`.

`JobKind`, `JobStep` and `Job` live in `packages/schema/src/domain.ts` (contract gate AC-38 extends to them). `ComfyJob` and the old `jobs` shape are removed.

Existing tests that change with the job model (spec session updates them on approval): AC-23 (statuses read from `steps` instead of the log), AC-28 (status line), AC-41, AC-44, AC-46 (`jobs.at(-1)` → the job returned by the call). Behaviour they check does not change.

## 7. ComfyUI workflows

`workflows/cloud/photo-to-3d-moge.json` (new), tags `roomfit:photo` (LoadImage) and `roomfit:save` (SaveGLB):

`LoadImage → LoadMoGeModel(moge_2_vitl_normal_fp16) → MoGeInference(resolution 9, fov auto, batch 1, mask on, refine 3) → MoGePointMapToMesh(decimation 2, discontinuity 0.04, texture on) → MeshToFile3D → SaveGLB`

Verified on Comfy Cloud 2026-10-18: job `17f5c779-5840-4bde-a98b-4e9367f35926`, GLB 12.5 MB. All nodes exist in the pinned local catalog except where noted at implementation; the snapshot gains them as detailed nodes so AC-8-style linting applies.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-47 | active | Every Comfy job appears as one card with kind, title, current step, elapsed and expected seconds; done cards show a thumbnail and their actions; failed cards show the Comfy message and Retry |
| AC-48 | active | Up to 3 jobs run at once (a render can start while a product generates); a 4th waits as queued; no control is disabled because a job runs |
| AC-49 | active | Expected seconds follow the median of earlier finished jobs of the same kind, with the documented defaults before any |
| AC-50 | active | Each plan room shows a label at its centroid with its name and item count (point in polygon); clicking focuses the room |
| AC-51 | active | Renaming a room from its label updates the chip, label and saved layout; empty names are rejected; Undo restores the name |
| AC-52 | active | The library lists every asset with size, source, fit mode and a local thumbnail; "Place in" puts it in the chosen room via `findSpot`, selects it, and is undoable; no space is reported and nothing changes |
| AC-53 | planned | A finished render or an uploaded room photo becomes a 3D photo job through the MoGe workflow and opens in the viewer; the viewer limits turning to ±20° yaw and ±10° pitch and closes with Back |
| AC-54 | active | `workflows/cloud/photo-to-3d-moge.json` lints against the pinned Comfy Cloud catalog (`spec/contracts/comfy-cloud-object-info.json`, taken through the comfy-cloud MCP) and tags its input and save nodes |
| AC-55 | manual | Recording on real Comfy Cloud: two jobs in parallel in the panel, an asset placed from the library, a room renamed, a render opened as a 3D photo, and a real room photo opened as a 3D photo |

## 9. Test plan

| AC | Level |
| --- | --- |
| AC-47, AC-48 | e2e with the fake ComfyUI (gains a per-job delay knob so two jobs overlap; a failing upload name already exists) |
| AC-49 | unit test of a pure `expectedSeconds(jobs, kind)` |
| AC-50 | unit test of point-in-polygon counts + e2e for labels and focus |
| AC-51, AC-52 | e2e through the API and the rail's labelled controls; `placeAsset` reuses `findSpot` (AC-39) |
| AC-53 | e2e with the fake ComfyUI returning a GLB; viewer limits checked through `state()`/camera |
| AC-54 | the existing workflow linter test (AC-8 table) extended |
| AC-55 | `demo/` recorder on real Cloud |

## 10. Risks and open questions

Risks
- MoGe meshes tear at depth edges; mitigated by limiting the viewer's motion and labelling it "3D photo" (not a walkable room).
- Concurrency on Cloud depends on the account's plan; jobs above the plan's limit queue on Cloud, which the card shows as `queued`.
- Real room photos are personal; they go to whatever ComfyUI is configured. The rail says so next to the upload.
- 12 MB GLBs per 3D photo; decimation 2 is the default, adjustable later.

Open questions (settled 2026-10-18 on the recommended answers)
1. Concurrency limit: **3** (recommended) / 1 (keep serial) / unlimited.
2. Library scope: **assets in the current layout** (recommended for M3) / a personal library across layouts (needs storage, M4).
3. 3D photo placement: **standalone viewer** (recommended) / place the 3D photo into the house (needs alignment, later).
4. Should real room photos stay local when the configured ComfyUI is Cloud? **Allow with the visible note** (recommended) / require a confirmation each time.

## Change log

- 2026-10-18 Draft, written after Dante asked for the job panel, room labels with asset placement, and 3D photos — and for features to be specified and documented before they are built. Feasibility of MoGe on Cloud checked first.
- 2026-10-18 Approved. Dante: "알아서 해줘 어떻게 하는게 좋은지" — open questions settled on the recommended answers: 3 concurrent jobs; library = assets in the current layout; standalone 3D photo viewer; real photos allowed with the visible note.
