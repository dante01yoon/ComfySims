# ADR-0002: Fit generated meshes per axis to listed dimensions

Date: 2026-10-18

## Status

Proposed

## Context

Image-to-3D models output meshes with arbitrary scale, origin and often wrong proportions. Products list width, depth and height. The question a user asks is "does it fit", so the footprint and height must match the listing.

## Decision (proposed)

- Coordinate frame: glTF Y-up; front of the product faces −Z; width = X, height = Y, depth = Z.
- Scale each axis independently so the bounding box equals the listed dimensions (±1 cm, AC-3).
- Move the mesh so the pivot is at bottom center (AC-4).
- Placed items carry no scale field: an item is always the size of its asset. The schema rejects `scale`.

## Trade-off

Per-axis scaling can stretch a mesh whose proportions were wrong. The alternative, uniform scaling to the largest axis, keeps proportions but misreports the footprint, which defeats the product. Stretch is visible and fixable by regenerating; a wrong footprint is silent.

## Open

Confirm with the owner. Revisit if the stretch looks bad on the fixture comparison run.
