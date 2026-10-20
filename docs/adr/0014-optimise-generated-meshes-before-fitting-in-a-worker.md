# ADR-0014: Optimise generated meshes before fitting, in a Web Worker, and cache the result

Date: 2026-10-19

## Status

Accepted

## Context

Image-to-3D workflows return each piece as ~120,000 triangles with three 2048² PNG textures, 7–17 MB per GLB. A furnished house is 205 MB of GLB and ~800 MB of texture memory. Profiles (M15 after-run) show the load and view-switch stalls are spent:

- uploading those textures to the GPU on the main thread;
- parsing and fitting the GLBs on the main thread;
- reallocating render targets when the canvas resizes.

## Decision

- **Optimise inside the fit step.** `fitGlbBytes` already reads and rewrites every generated GLB. It now runs: weld → simplify (meshoptimizer, 25k triangles, error ≤ 0.5% of size) → prune/dedup → resize textures to 1024² or 512² by listed size → WebP. Then it aligns and fits.
- **Optimise first, fit second.** The listed size is applied to the optimised mesh, so the exact-size guarantee (AC-3) holds.
- **Run in a Web Worker.** The editor posts the GLB bytes and gets the fitted bytes back as a transferable buffer. OffscreenCanvas resizes and encodes textures in the worker. The resizer is injected, so `packages/fit` stays testable in Node.
- **Cache in IndexedDB.** The key covers the source and every fit input plus an optimiser version, so a change to any of them misses the cache.
- **Upload progressively and keep the canvas size.** At most 2 texture uploads per frame. The canvas size does not change between views, and studio shaders compile ahead.

## Alternatives

- **KTX2 / Basis Universal textures:** these stay compressed in GPU memory, 4–8× smaller than RGBA. But the browser encoder is ~2 MB of WASM and takes seconds per 1024² texture. Deferred; WebP at the right size already removes ~94% of texture memory per piece. It is the next step if memory is still the limit.
- **Optimise on the ComfyUI side (a node in the workflow):** that would help Local and Cloud alike. But it changes every workflow and Cloud's node catalog, and assets added by URL or file would skip it. Rejected for now; the editor sees every asset.
- **Draco or meshopt geometry compression in the file:** this shrinks downloads but not GPU memory or upload time, and adds a decoder. After simplification the geometry is already small. Not needed.
- **Level-of-detail meshes:** more files and more bookkeeping for a scene of a few dozen pieces. Simplifying to one sensible level is enough.

## Consequences

- Stored and saved assets are the optimised ones. The original generated GLB is not kept; regenerating gives a new one.
- The fit report records before/after triangles, bytes and texture sizes, so the gain is visible per asset.
- A new optimiser version invalidates the cache, and pieces are re-optimised on next load.
