# ADR-0010: 360° views are generated from a depth panorama of the layout, on demand

Date: 2026-10-18

## Status

Accepted (with spec M5)

## Context

Dante wanted the photoreal room to survive turning around ("360도 회전할 때 생성형으로 … 토글로"). Options: a text-to-360 image, a video or novel-view model orbiting a render, or stitching four perspective renders. The view has to be this layout, and it costs one large generation, so it must be opt-in.

## Decision

- **Qwen-Image 2512 + qwen-360-diffusion LoRA + Lightning 4-step, conditioned by Fun ControlNet Union 2602 on an equirectangular depth panorama rendered from the layout** at the room's standing point (eye 160 cm). Default control strength 0.6.
- Generated only on a click (or the `view_360` MCP tool); stale views are labelled, never regenerated automatically.

## Evidence (spike 2026-10-18, Comfy Cloud)

Same prompt and seed 42, 2048×1024, 4 steps. Image: `docs/recordings/media/m5-spike-compare.jpg`; graph: `demo/m5-spike/`.

| Run | Job | Layout | Seam (mean |col0−col2047|, adjacent-column baseline 3.3) | Look |
| --- | --- | --- | --- | --- |
| no control | `d4f9a312` | wrong: bed and chair elsewhere, extra doors | 2.9 | photoreal |
| depth 0.6 | `d884a841` | bed, armchair, lamp, wardrobe, 2 windows, door where the layout has them | 2.8 | clean, slightly CG |
| depth 0.9 | `4f09e5e4` | same, but armchair becomes a box | 2.8 | flat, CG |

## Alternatives rejected

- **Text-to-360 alone**: beautiful, different room (row 1).
- **Video / NVS orbit (Wan, Seedance camera moves)**: paid API nodes or not layout-conditioned; a clip, not a look-around.
- **Four perspective renders stitched**: visible seams and lighting jumps; kept only as a fallback if the 360 LoRA path breaks.

## Consequences

- Stronger control trades photorealism for layout fidelity; `end_percent` tuning is left to the implementation (AC-69 recording judges it).
- The editor owns a new render path (depth cube → equirectangular), tested for yaw alignment (AC-63).
