# ADR-0006: The editor drives ComfyUI or Comfy Cloud directly; the key stays in the local server; meshes are re-fitted on load

Date: 2026-10-18

## Status

Accepted

## Context

The first end-to-end demo (AC-10) called Comfy Cloud from the agent's tools, not from the product. A real demo, and real use, needs the editor itself to send a photo to ComfyUI, get a 3D model back, and render the room. Comfy Cloud authenticates with an API key and cannot run our custom node.

## Decision

- **One client for local ComfyUI and Comfy Cloud v1**: upload, prompt, jobs, view. The editor only knows a base URL.
- **The key never reaches the browser.** The dev server proxy adds `X-API-Key` from the environment and follows the `/api/view` redirect itself without the key (Cloud docs: do not follow the redirect with the key attached). AC-25 checks browser requests, served code and the redirect target.
- **Fit in the browser** with `fitGlbBytes`, because Cloud cannot run `RoomfitFitMesh`. The same pure function backs the Node path.
- **Store the source, not the fitted mesh.** Assets keep `comfy-output:<subfolder>/<filename>` plus the listed size and fit mode; the editor re-fits on load. Fitting is deterministic, so nothing new needs hosting.
- **Pin the Cloud workflow as JSON** taken from a real Cloud run of Comfy's own template, verified by running it.

## Rejected

- Calling Comfy Cloud from the browser with the key in client code: leaks the key.
- Uploading the fitted GLB back to ComfyUI: `upload/image` is for images; a second storage path is not needed when fitting is reproducible.
- A hosted backend: out of scope (ADR-0001).

## Consequences

- A real Cloud run needs `COMFY_CLOUD_API_KEY` (paid subscription) in the owner's environment; the harness uses a fake server and a test key.
- Saved layouts with `comfy-output:` assets only open where that ComfyUI's outputs are reachable.
