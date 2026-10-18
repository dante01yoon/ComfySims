# ADR-0002: Listed dimensions are the truth; mesh fitting is a pluggable visual mode

Date: 2026-10-18

## Status

Accepted

## Context

Image-to-3D models output meshes with arbitrary scale, origin and often wrong proportions. Products list width, depth and height. The question a user asks is "does it fit". Two fitting rules were on the table:

- **Per-axis (exact):** scale each axis so the bounding box equals the listing. The footprint is right; a mesh with wrong proportions gets stretched.
- **Uniform:** one scale factor, mesh fits inside the listed box. Proportions are kept; the mesh can be smaller than the listing on some axes.

Picking one and baking it into collision logic would make either choice expensive to change later, and better options are coming (per-part fitting, regenerating with dimension-aware prompts, models that output metric scale).

## Decision

1. **The listed dimensions are the source of truth for every fit question.** Collision, room bounds and snapping use `asset.dimensions`, never the mesh bounds. The answer to "does it fit" is correct whatever the mesh looks like.
2. **Fitting the mesh is a visual concern with a named mode**, recorded on the asset: `fit.mode`.
   - `exact` (default): per-axis scale to the listing (AC-3).
   - `uniform`: one factor, largest fit inside the listed box, proportions kept (AC-11).
   - New modes are added to the enum; the layout contract and collision code do not change.
3. **Every fit produces a report** with per-axis scale and `distortion = max scale / min scale`. Above 1.15 the asset is flagged so the editor can suggest `uniform` or regenerating (AC-12). The distortion is stored on the asset.
4. Frame: glTF Y-up, front faces +Z (glTF convention, corrected 2026-10-18 from real TRELLIS.2 output), width = X, height = Y, depth = Z. Pivot at bottom center in every mode (AC-4).
5. Placed items carry no scale field; an item is always the size of its asset.

## Why this is the extensible choice

The risky coupling was "what the mesh looks like" ↔ "whether it fits". Separating them means fitting strategies can change, multiply or be replaced by better models without touching the contract, collisions, saved layouts or the fit answer users rely on.

## Rejected

- Per-axis only, no mode: simplest, but a stretched mesh would have no way out except regenerating.
- Uniform only: the mesh could visually understate the footprint while collisions use the listing, which looks like a bug.
- Collisions from mesh bounds: the answer would depend on generation quality.
