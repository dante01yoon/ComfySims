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
| AC-3 | planned | Fitting a generated GLB to listed dimensions yields a bounding box within ±1 cm of width, depth and height |
| AC-4 | planned | A fitted GLB has its pivot at bottom center: min y = 0 and x/z center = 0 (±0.5 cm) |
| AC-5 | planned | Two placed items whose footprints overlap are reported as colliding; items that only touch are not |
| AC-6 | planned | An item whose footprint leaves the room, or whose height exceeds the ceiling, is reported as out of bounds |
| AC-7 | planned | Dropped and dragged items snap to a 5 cm grid and to 15° rotation steps |
| AC-8 | planned | Every `class_type` in `workflows/*.json` exists in the pinned ComfyUI node catalog snapshot |
| AC-9 | planned | The editor exports depth, normal and object-mask PNGs from the current camera at the requested size |
| AC-10 | manual | End to end: fixture sofa photo → fitted GLB → placed in the fixture room → photoreal render (evidence: demo recording) |

## Decisions behind this spec

- Scope cut and wedge: [ADR-0001](../docs/adr/0001-m1-scope-real-scale-wedge.md)
- Fitting rule (per-axis scale, Y-up, front = −Z): [ADR-0002](../docs/adr/0002-fit-per-axis-to-listed-dimensions.md)
- Harness-first, spec-driven workflow: [ADR-0003](../docs/adr/0003-harness-first-spec-driven.md)

## Open questions

- Which image-to-3D model is the default local path (Hunyuan3D 2.x vs TRELLIS) — decide after a fixture comparison run.
- Front-facing detection: assume the product photo is a front shot for M1, or add a rotate control in the editor?
