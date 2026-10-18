# ADR-0007: Home studio = plan rooms in the contract + a second, presentation-grade view of the same editor

Date: 2026-10-18

## Status

Accepted

## Context

The owner wants the home view to look like Meng To's cut-away house (2026-10-15): a whole home, walls cut open, warm materials, landscape, and a bottom bar of scene presets. M1 has one box room.

## Decision

- **Plan rooms in the contract, not in the renderer.** Walls (centre lines), openings and floor zones are layout data, so placement rules (walls are solid, doors are passable) are tested pure functions like the rest of placement, and a future image-to-plan step only has to produce JSON.
- **One editor, two views.** `editor` stays the working view; `studio` is presentation: no roof, thick cut walls, materials, sun + warm interior lights, AO, landscape. Same layout, same API, same items.
- **Scene presets are data** (a table in the spec), applied by `setScene` and reported by `lighting()`, so tests check values and a coarse luminance difference instead of pixels.
- **Nothing from the network.** Procedural materials and greenery, no HDRI downloads: the studio works offline, in the node pack, and in the harness.

## Rejected

- A separate "showcase" app: two code paths for the same house would drift.
- Photoreal by baking or path tracing in the browser: too slow for the live editor; ComfyUI render passes already cover photoreal stills.
- HDRI environment maps from a CDN: breaks offline use and the harness.
