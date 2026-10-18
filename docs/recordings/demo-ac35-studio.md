# AC-35 — home studio with real generated furniture (2026-10-18)

Video: [media/roomfit-studio.mp4](media/roomfit-studio.mp4) (15 s, 1600×900, 30 fps, rendered frame by frame on the Apple M4 Max GPU through headless Chrome + Metal).

![grid](media/studio-grid.jpg)

## How the furniture was made

| Step | Tool | Result |
| --- | --- | --- |
| 14 product photos | Comfy Cloud batch, `image_z_image_turbo` | three-quarter product shots on white |
| 15 models (with the M1 sofa) | `demo/furnish-house.ts` → roomfit's own `packages/comfy` client through the dev proxy → `workflows/cloud/product-to-glb-pixal3d.json` | 15/15 in 198 s, all queued at once |
| Fit | `fitGlbBytes(…, 'auto')` (AC-36, AC-37) | yaw aligned, 3 exact / 12 uniform, ~75 ms each — [details](demo-house-fit-auto.json) |
| Place | `fixtures/layouts/demo-house.json` positions | 0 collisions, 0 out-of-bounds |
| Record | `demo/record-studio.mjs` | 455 frames in 77 s on Metal (SwiftShader: ~9 s per frame) |

## What it taught us

- Without alignment, 13/15 models were flagged (distortion up to 4.12): three-quarter photos give turned models. Fixed in the fit (AC-36/37), not in the prompt.
- Uniform fit keeps shapes but leaves some pieces smaller than their listing (e.g. the kitchen counter). Better generation prompts (straight-on views) or per-part fitting would close the gap.
- Headless Chrome uses SwiftShader by default; `--use-angle=metal` gives the real GPU, ~50× faster for recording. The harness keeps SwiftShader for determinism.
