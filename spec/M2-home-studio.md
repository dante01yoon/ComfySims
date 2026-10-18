# M2 — Home studio: a whole furnished house, cut open, lit by scene presets

## Goal

Show a whole home the way the reference does (Meng To, 2026-10-15: a cut-away 3D house seen from above, warm materials, landscape, and a bottom bar of scene presets — Reading, Work, Movie, Evening). The house is a floor plan with several rooms; every piece of furniture is real size, ideally generated from product photos through Comfy Cloud (M1).

## Non-goals (M2)

- Floor plan from an image (later); the plan is JSON
- Smart-home control, multiple floors, roofs, stairs
- Network-loaded assets (HDRIs, textures, CDNs) — everything is procedural or local

## Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-29 | active | The layout contract accepts plan rooms (walls, door and window openings, named floor zones) and rejects broken plans with the failing path |
| AC-30 | active | In plan rooms, an item is out of bounds when its footprint leaves the zones, hits a wall (doors are passable, everything else is solid), or rises above the walls; touching a wall face is fine |
| AC-31 | active | The editor loads the demo house with every item at its listed size and reports no problems |
| AC-32 | active | Studio view frames the whole house from above at three-quarters (elevation 30–65°) |
| AC-33 | active | Scene presets Reading / Work / Movie / Evening set the lighting from the table below, the bottom bar shows the active one, and evening is visibly darker than work |
| AC-34 | active | The studio loads nothing from the network |
| AC-36 | active | Before fitting, a generated model is turned about Y to its smallest footprint with its long side on the longer listed axis, so a model generated from a three-quarter photo fits without distortion; the applied yaw is reported and alignment can be switched off |
| AC-37 | active | Fit mode `auto` uses `exact` when the aligned distortion is at most 1.15 and `uniform` otherwise, reporting both the requested and the chosen mode |
| AC-38 | active | Shared domain types (out-of-bounds reasons, collisions, fit modes, fit report) are defined once in `packages/schema`; a type-level check fails typecheck when placement, fit or the editor contract drift from them |
| AC-35 | manual | A studio recording of the demo house that holds up next to the reference: cut-away walls, warm materials, landscape, presets switching (evidence 2026-10-18: `docs/recordings/demo-ac35-studio.md`) |

## Plan rooms (AC-29 ~ AC-31)

- `room.kind = 'plan'`: `wallHeight`, `wallThickness`, `walls[{ id, from, to }]` (centre lines, cm), `openings[{ wallId, kind: door | window, offset, width, height, sill }]` (offset measured from the wall's `from`), `zones[{ id, name, polygon, floor: oak | walnut | tile | concrete | carpet }]`.
- Placement (`packages/placement`): every footprint corner must lie in some zone (`outside-room`); the footprint must not overlap any solid wall piece — a wall is a `wallThickness`-wide rectangle around its centre line, minus its door openings (`hits-wall`); `y + height` must not exceed `wallHeight` (`above-ceiling`). Reasons per item in that order. Touching counts as clear (0.001 cm). Box rooms behave as before.
- Fixture: `fixtures/layouts/demo-house.json` — 14 × 10 m single storey: living, kitchen & dining, bedroom, office, bath, garage; 15 furnished items with box stand-ins until generated models exist.

## Studio view (AC-32 ~ AC-34)

- `setView('studio')` / `setView('editor')`; the editor view keeps working for plan rooms (walls as boxes with openings cut).
- Studio look: no roof; walls cut open at full height with visible thickness and openings; zone floors in their material; soft shadows from a sun light; ambient occlusion; a ground plane with grass, a driveway in front of the garage door, and simple low-poly trees and shrubs around the house; tone mapping for a warm, filmic look. Camera orbits with damping; default view from the south-east at three-quarters.
- Bottom bar (overlay on the 3D view, centred): pill buttons Reading, Work, Movie, Evening with `aria-pressed` on the active one. Clicking animates the lighting over ~1 s; `lighting()` reports the target values at once.

| Preset | Sun elevation | Sun azimuth | Sun colour | Sun intensity | Interior colour | Interior intensity |
| --- | --- | --- | --- | --- | --- | --- |
| work | 55° | 150° | 6000 K | 3.0 | 5000 K | 0.6 |
| reading | 35° | 200° | 4500 K | 2.0 | 3000 K | 1.0 |
| movie | 8° | 250° | 3200 K | 0.4 | 2400 K | 0.35 |
| evening | 4° | 270° | 2700 K | 0.6 | 2700 K | 1.4 |

Interior lights are warm point lights near the ceiling of each zone; they make rooms glow when the sun is low.

## Decisions behind this spec

- [ADR-0007](../docs/adr/0007-home-studio-plan-rooms.md)

## Open questions

- Generated furniture for every demo-house item through Comfy Cloud (batch of product photos) — needed for AC-35, not for the automated ACs.

## Fitting real generated furniture (AC-36, AC-37)

Found on 2026-10-18 by generating the demo-house furniture on Comfy Cloud: 13 of 15 models were flagged (distortion up to 4.12). Root cause: the model inherits the photo's viewpoint, so a three-quarter product photo yields a model turned ~30–60° about Y, whose bounding box is nearly square. Product listings usually use three-quarter photos, so this must be handled in the fit, not in the prompt.

- `fitGlbBytes(bytes, dimensions, mode, { align?: 'auto' | 'none' })`, default `align: 'auto'`: rotate about Y by the angle (0.5° steps over 0–90°) that minimises the footprint's bounding-box area, then by 90° if needed so the longer footprint side lies on the longer listed axis (width → X, depth → Z). Ties keep 0°. The 180° front/back ambiguity is not resolved (ADR-0002 front = +Z stays the convention).
- `FitReport` adds `requested` (the mode asked for) and `yawDegrees` (applied rotation, 0 when none). `mode` is the mode actually used.
- `FitMode` adds `auto`: aligned exact distortion ≤ 1.15 → `exact`, else `uniform`. Assets store the requested mode; re-fitting on load is deterministic.
- The editor panel defaults to `auto`; `addProductFromPhoto` keeps `exact` as its default.
- Open: the Python node pack does not align yet (AC-18 parity covers axis-aligned meshes only).

## Contract gate (AC-38)

Added after the spec session left the editor contract behind three times (impl-05, impl-07, impl-09 each ended `BLOCKED:`). `packages/schema/src/domain.ts` owns `OutOfBoundsReason`, `Collision`, `AppliedFitMode`, `FitReport`; `spec/contracts/editor-api.ts` uses them; `acceptance/contract-types.ts` asserts the public signatures of `outOfBounds`, `collisions`, `fitGlbBytes` and the editor contract are equal to them. `packages/schema/` is now protected like `spec/` (it is the contract). Mutation-checked: removing `hits-wall` from the shared type fails typecheck in `contract-types.ts`.
