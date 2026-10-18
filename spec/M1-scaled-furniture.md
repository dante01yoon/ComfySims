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
| AC-8 | planned | Every `class_type` in `workflows/*.json` exists in the pinned ComfyUI node catalog snapshot |
| AC-9 | active | The editor exports depth (near = bright), camera-space normal and object-mask PNGs from the current camera at the requested size |
| AC-10 | manual | End to end: fixture sofa photo → fitted GLB → placed in the fixture room → photoreal render (evidence: demo recording) |
| AC-11 | active | `uniform` fit keeps the source proportions (±0.5%) and fits inside the listed box, touching it on at least one axis (±1 cm) |
| AC-12 | active | Every fit returns a report with per-axis scale and distortion = max/min scale, flagged above 1.15 |
| AC-13 | active | Fitting never throws: unreadable files, GLBs without a scene and zero-size bounds return a failure reason and write nothing |
| AC-14 | active | The editor loads a valid layout and shows each item at its listed size and position (a box stand-in when the GLB is missing); an invalid layout is rejected with the failing path and the current layout is kept |
| AC-15 | active | Moving and rotating items in the editor snap (AC-7), and collisions and out-of-bounds (AC-5, AC-6) update and highlight live |
| AC-16 | active | Saving returns the edited layout, which passes the layout contract |
| AC-17 | active | Undo and redo cover move, rotate and remove; loading starts a fresh history; a new edit clears redo |

## Decisions behind this spec

- Scope cut and wedge: [ADR-0001](../docs/adr/0001-m1-scope-real-scale-wedge.md)
- Listed dimensions are the truth; fitting is a visual mode (`exact` | `uniform`): [ADR-0002](../docs/adr/0002-fit-per-axis-to-listed-dimensions.md)
- Harness-first, spec-driven workflow: [ADR-0003](../docs/adr/0003-harness-first-spec-driven.md)
- Editor stack and agent-legible API: [ADR-0004](../docs/adr/0004-editor-stack-and-agent-api.md)

## Spec changes

- 2026-10-18: `fitGlb` returns an outcome instead of throwing (raised by implementation session impl-01-fit, see `docs/recordings/impl-01-fit.md`). AC-13 added.
- 2026-10-18: room origin stated (floor center, raised by impl-02-placement); `no-scene` fixture added to AC-13.

## Open questions

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
