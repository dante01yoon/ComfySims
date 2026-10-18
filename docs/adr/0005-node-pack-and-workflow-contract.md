# ADR-0005: Node pack fits ComfyUI meshes in torch; workflows are linted against a pinned catalog; real ComfyUI runs in the harness

Date: 2026-10-18

## Status

Accepted

## Context

M1 ships as one ComfyUI node pack. Three questions: where fitting runs inside ComfyUI, how to keep workflow JSON honest without GPUs or models in the harness, and how to test that the pack really loads.

## Decision

- **Fit on MESH, not on GLB files.** Core 3D nodes (`VoxelToMesh`, Trellis2, mesh ops) pass `Types.MESH` (vertex tensors). `RoomfitFitMesh` sits between generation and `SaveGLB`, so any MESH source works and no GLB parser is needed in Python. The TypeScript `fitGlb` stays for files that arrive as GLB (uploads, API nodes).
- **Same rule, two languages, shared fixtures.** The Python tests reuse the TypeScript fixture boxes and expected reports, so drift between the two shows up as a failing AC.
- **Pinned node catalog.** `spec/contracts/comfyui-object-info.json` holds all class names plus full specs for the nodes our workflows use, taken from a real `/object_info`. The harness linter checks classes, required inputs, links, link types and combo values. Our own node's spec lives in `spec/contracts/roomfit-nodes.json` and AC-19 checks the live node against it.
- **Tagged input nodes.** Workflows mark input nodes with `_meta.title = "roomfit:*"`; prompt builders find nodes by tag, never by node id, so a user can rewire a workflow in ComfyUI and the editor still drives it.
- **Real ComfyUI in the harness, isolated.** AC-19 boots the owner's local ComfyUI on CPU with `--base-directory .harness/comfy-base` and a symlink to `nodes/roomfit`. The checkout is not modified. No models are needed to register nodes or serve routes.
- **Editor served by the pack.** `pnpm web:build:nodepack` builds with base `/roomfit/` into the pack; one install gives the editor on ComfyUI's own origin (ADR-0001).

## Rejected

- Fitting GLB files in Python (pygltflib or a hand-rolled parser): an extra dependency and a second file format path for no M1 gain.
- Linting against whatever ComfyUI happens to be running: unrepeatable; the pin makes changes reviewable.
- Matching workflow nodes by id: breaks as soon as someone edits the workflow in the canvas.

## Consequences

- The harness depends on a local ComfyUI checkout with a venv; without it the Python gate is skipped and AC-18/19 show `NO TEST`.
- The pinned catalog comes from a ComfyUI checkout behind upstream; refreshing it is a spec-session task.
