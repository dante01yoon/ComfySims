# ADR-0015: Walkthrough videos come from a depth video the editor renders, through LTX-2.3 IC-LoRA

Date: 2026-10-20

## Status

Accepted

## Context

M17 adds a short photoreal walkthrough of a room. It has to show this layout, not a plausible room, and it runs on the backends ComfySims already uses. In 2026-10-18, M5 (ADR-0010) rejected video models as "paid or not layout-conditioned". The Comfy Cloud catalog of 2026-10-20 has `video_ltx2_3_ic_lora`: the open LTX-2.3 22B model with an IC-LoRA that follows a frame-aligned control video. It uses no paid API nodes.

Spike (`docs/spikes/m17`, 4 Cloud runs):

- **The control video works.** A depth video rendered by the editor along a 4.8 s path keeps the sofa, coffee table, rug, windows and the doorway in place.
- **The first frame must come from frame 0's depth.** "Render this view" framed the room slightly differently, and the clip jumped after its first frame.
- **The template's prompt-enhance branch leaks its demo prompt** ("a lush jungle ruin") into a second text node.
- **A VP9 WebM control video gives the same result as H.264 mp4** (job `06709909`).
- **The test browser cannot use H.264.** Playwright's Chromium neither encodes nor plays H.264 without a GPU, while VP9 encodes and plays there.

## Decision

**The editor renders the path.** One fixed path per room:
- It starts at the room's eye-level shot, dollies up to 160 cm and pans +25° over 121 frames at 25 fps.
- The dolly is shortened in 10 cm steps until every eye clears the M15 walk obstacles.
- The path is a pure function in `packages/motion`.

**The depth video uses the render pass's lens and a fixed range.**
- Each frame is a depth pass at 1280 × 704, depth 40–900 cm, the same for every frame.
- The editor encodes the frames in the browser to VP9 WebM, with WebCodecs and `mediabunny` (MPL-2.0) as the muxer.

**The first frame is a `render-from-depth` run on frame 0's depth.**

**Our own pinned workflow, not the template.**
- `workflows/cloud/walkthrough-ltx23-ic-lora.json` is the API graph that ran on Cloud. The prompt-enhance branch and the audio output are removed.
- It is tagged `roomfit:first-frame`, `roomfit:control-video`, `roomfit:positive`, `roomfit:seed` and `roomfit:save`.
- The local variant only drops `MoGeInference.refine_steps`, which the 2026-08 local ComfyUI lacks and MoGe-2 ignores.

**The MoGe depth branch stays.** The spike passed with it.

## Alternatives

- **Paid partner video models** (Kling, Veo, Seedance and others) with a start image and a camera prompt: better motion, but they cost money per clip and are not conditioned on the layout, so the room drifts. Rejected for the same reason as in ADR-0010.
- **Canvas color frames through the template's MoGe estimator:** no new render code. But the studio canvas is a cut-away under side panels with a view offset, so its framing never matched the first frame (spike). Rejected.
- **H.264 mp4 with `mp4-muxer`**, the answer approved with the spec: Playwright's Chromium cannot encode H.264 without a GPU or play it at all, so the depth video could not be tested on CI. The successor library `mediabunny` writes WebM. Changed after the measurement; the Cloud output stays mp4.
- **Uploading 121 PNG frames:** no dependency, but 121 uploads per job and a workflow shape the spike did not run. Rejected.
- **Feeding depth straight into `control_images` and skipping MoGe:** likely faster and closer to the layout, but unproven. It is a follow-up after the M17 recording.
- **Recording the M15 walk as the path:** a better product, but it needs path editing, smoothing and length limits. It is a follow-up.

## Consequences

- A new dev dependency, `mediabunny` (tree-shaken; only the WebM muxer is bundled).
- One walkthrough is three uploads and two Cloud jobs (first frame, then the clip): about 60 s of Cloud time in the spike, 0 credits.
- Clips are ~5 s. Items that leave the frame during the pan can fade out, so the pan stays small.
- The local backend needs ~38 GB of LTX/Gemma/MoGe models. Readiness (M10) names the missing files.
