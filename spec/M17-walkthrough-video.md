# M17 — Walkthrough video: a photoreal clip that moves through your layout

| | |
| --- | --- |
| Status | In review |
| Date | 2026-10-20 |
| Owner | Dante |
| Decisions | ADR-0015 (written on approval) |
| Spike | [docs/spikes/m17](../docs/spikes/m17) |

## 1. Why

**A render is one frame; people share a walkthrough.** README has listed "a video walkthrough job" as 🧪 planned since M10. "Render this view" gives one eye-level photo (M2, M13). The 360° view (M5) lets you look around from one standing point. Neither shows what it is like to walk into the room. Dante picked this as the next milestone (2026-10-20).

**It has to stay this layout.** M5 rejected video models because they were "paid or not layout-conditioned". The Comfy Cloud catalog now has an open, layout-conditionable option: `video_ltx2_3_ic_lora`, LTX-2.3 22B (distilled fp8) with the IC-LoRA Union Control. It takes a first frame and a frame-aligned control video (depth, pose or edges), runs no paid API nodes and costs 0 credits.

**The spike passed (2026-10-20, §7).**
- **Input:** a 121-frame depth video rendered by the editor along a 4.8 s path through the furnished demo living room, plus a first frame from the existing `render-from-depth` workflow on frame 0's depth.
- **Result:** a 1280×704, 25 fps clip. The sofa, coffee table, rug, windows and the doorway to the dining table stay where the layout has them while the camera dollies and pans.

![spike](../docs/spikes/m17/walkthrough-v2-vs-depth.jpg)

## 2. Goals and non-goals

Goals
- From a focused room in the studio, **"Walkthrough video"** generates a ~5 s photoreal clip along a short eye-level path through that room. The clip is conditioned on depth rendered from the current layout.
- The clip plays in a viewer with Download. It runs as a normal job card (M3), and agents get it as an MCP tool (M4).
- Off by default. Each generation is a deliberate click, with the expected time shown.

Non-goals (M17)
- **User-drawn or recorded camera paths** (record the M15 walk and replay it). M17 uses one fixed path per room. Recording a walk is the natural follow-up once the pipeline exists.
- **Clips longer than ~5 s, and multi-room tours.** LTX-2.3 IC-LoRA was proven at 121 frames. Chaining clips (last frame → next first frame) is a follow-up.
- **Audio.** LTX-2.3 can generate sound; the workflow keeps it off.
- **The local backend.** The models are ~38 GB (checkpoint 27.5 GB, Gemma 3 12B text encoder 8.8 GB, IC-LoRA, MoGe). The M10 capability check already reports missing model files, so a local ComfyUI that has them works with no extra code. M17 tests only Cloud.
- **Saving clips in the layout file.** Clips stay with the session's jobs, like panoramas (M5).

## 3. Scenarios

1. **Walk into the living room.**
   - Dante focuses Living and clicks **Walkthrough video**.
   - A job card "Walkthrough · Living" appears (expected ~3 min) and goes through: rendering path → first frame → uploading → queued → generating → downloading → done.
   - When it finishes, the viewer opens and plays the clip. The camera moves from the room's eye-level shot past the sofa toward the far side.
   - **Download** saves `comfysims-walkthrough-living.mp4`; **Close** returns to the studio.
2. **Stale clip.** After he moves the sofa, the Living walkthrough's job card says "Layout changed since this video" and offers **Regenerate**. The old clip still plays.
3. **Agent.** Asked "Make me a walkthrough of the bedroom", the agent calls `walkthrough_video({ room: "bedroom" })` and gets back the saved mp4 path, the first frame as image content and the job id.

## 4. Screens and states

- **Studio bottom bar:** **"Walkthrough video"** sits after "360° view".
  - Disabled, with the tooltip "Focus a room first", when no room is focused.
  - Disabled, with the backend's missing-model message (M10), when the selected backend cannot run `walkthrough`.
- **Job card, kind `walkthrough`:**
  - Title: "Walkthrough · <room>".
  - Steps: `path` (editor renders the depth frames) → `first-frame` (a `render-from-depth` run on frame 0) → uploading → queued → generating → downloading → done.
  - Actions: **"Open"** and **"Regenerate"**. A failure shows the server message and **"Retry"** (M3 rules).
- **Viewer:** a full-window dialog named **"Walkthrough"**.
  - A `<video>` that autoplays muted and loops, with native controls.
  - **"Download"**, plus **"Close"** and Esc to close.
  - A stale clip shows "Layout changed since this video" in the viewer as well as on the job card.
- The viewer opens by itself when a `walkthrough` job finishes, like the 360° view.

## 5. Behaviour rules

**Path** (one per room, deterministic):
- Starts at the room's eye-level shot, the same camera as "Render this view" with a focused room.
- Over 121 frames at 25 fps (4.84 s), the eye dollies forward along its view direction and the yaw pans +25°, both with smoothstep easing (`t²(3 − 2t)`). Eye height and pitch stay fixed.
- **Dolly length:** 160 cm, shortened in 10 cm steps until every frame's eye stays inside the room polygon and clears the M15 walk obstacles (walls by ≥ 25 cm, furniture ≥ 50 cm tall). If even 40 cm fails, the path is a pure pan.
- A pure function `walkthroughPath(zone, layout) → CameraPose[121]` in `packages/motion`.

**Depth video:**
- Each frame is a depth pass from that frame's pose, using the same lens as the render pass (fov 50°, no view offset) at 1280×704.
- Depth uses a **fixed** range of 40–900 cm for every frame, so grey levels don't flicker as the range changes.
- The editor encodes the frames to H.264 mp4 at 25 fps in the browser and uploads it to ComfyUI's input folder.

**First frame:** the `render-from-depth` workflow on frame 0's depth at 1280×704. It uses the room's scene prompt (M13 `scenePrompt`, current preset and render style) and the job's seed.

**Generation:**
- `walkthrough-ltx23-ic-lora.json` gets the first frame, the depth video and a prompt.
- **Prompt:** `"A slow, steady camera walkthrough of "` + the room's scene prompt + `". The camera dollies forward and pans gently. The room stays still; no people."`.
- A caller's own prompt (MCP `prompt`) replaces the room part.

**Limits and staleness:**
- One `walkthrough` job per room at a time. Each counts toward `MAX_CONCURRENT_JOBS`.
- A clip remembers the layout revision it was made from. Any later change to items in that room, or to its walls, doors or windows, marks it stale.
- Clips are never regenerated automatically.

## 6. Contract and data changes

- **Schema:** `JobKind` gains `walkthrough`, and `DEFAULT_EXPECTED_SECONDS.walkthrough = 180`. The spike's runtime has not been measured precisely, and the M10 history replaces the default after the first runs.
- **`workflows/sets.json`:** `cloud.walkthrough` is `cloud/walkthrough-ltx23-ic-lora.json`, and `local.walkthrough` is the same file.
- **Editor API** (`spec/contracts/editor-api.ts`):
  - `walkthroughPath(zoneId)` → `{ poses: CameraPose[]; dollyCm: number }`.
  - `walkthrough({ zoneId?, prompt?, seed? })`. It uses the focused room when no `zoneId` is given, and returns `no-room` when there is neither.
  - `openWalkthrough(jobId)` and `closeWalkthrough()`.
  - `state().walkthroughViewer = { jobId, zoneId, stale } | null`.
  - Job `result = { video (blob URL), firstFrame (blob URL) }`.
- **MCP:** `walkthrough_video({ room, prompt?, preset?, seed? })` waits for the job, then returns `{ jobId, path }` plus the first frame as image content. `spec/contracts/mcp-tools.json` gains it.
- No breaking changes.

## 7. ComfyUI workflows

**New `workflows/cloud/walkthrough-ltx23-ic-lora.json`**, converted to API format from the `video_ltx2_3_ic_lora` template.
- **Nodes:** LTX-2.3 22B distilled fp8, the Gemma 3 12B text encoder with its LoRA, IC-LoRA Union Control (ref 0.5, strength 1.0), the MoGe video-depth branch (kept: it is what the spike proved), and `SaveVideo`.
- **Tags:**
  - `roomfit:first-frame` (LoadImage)
  - `roomfit:control-video` (LoadVideo)
  - `roomfit:positive`: both the prompt-enhance node and the plain `CLIPTextEncode`. The spike's first run showed that the template's jungle demo prompt leaks through the second one if only one is set.
  - `roomfit:seed`
  - `roomfit:save`, with prefix `roomfit/walkthrough`.
- Linted against the Cloud catalog snapshot, which gains the LTX, MoGe and video nodes.

### Spike result (2026-10-20) — PASS

The demo furnished house (`demo/out/house/furnished-layout.json`, 17 generated pieces), Living room, from the eye-level shot: dolly 160 cm + pan 25°, 121 frames, depth 40–900 cm. Capture script: [`docs/spikes/m17/capture-depth.mjs`](../docs/spikes/m17/capture-depth.mjs).

| Run | Cloud job | First frame | Result | Verdict |
| --- | --- | --- | --- | --- |
| v1 | `4bc0fceb` | "Render this view" at the eye-level shot (renders with an auto depth range and a slightly different framing) | geometry follows the depth, but the scene jumps after frame 0, and vines and stone appear on the far wall (template prompt leaked through `CLIPTextEncode`) | fail: two causes found |
| first frame | `db5bd6fa` | `render-from-depth` on frame 0's depth, 1280×704, seed 17 | matches the depth composition | used for v2 |
| v2 | `cd756248` | the matched first frame; prompt set on both text nodes | sofa, coffee table, rug, windows and the dining table through the doorway stay put for 4.8 s; light and materials stay consistent | **PASS** |

- **Evidence:** [`walkthrough-v2-with-depth.mp4`](../docs/spikes/m17/walkthrough-v2-with-depth.mp4) (clip over depth), [`walkthrough-v1-template-prompt-leak.jpg`](../docs/spikes/m17/walkthrough-v1-template-prompt-leak.jpg), [`first-frame-vs-depth.jpg`](../docs/spikes/m17/first-frame-vs-depth.jpg).
- **Found:**
  - The armchair at the right edge fades out in the last 30 frames. Items that leave the frame are not held.
  - The depth video goes through MoGe again. It works, but it adds a model and some seconds of compute; see open question 2.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-136 | planned | `walkthroughPath` returns 121 poses at the eye-level shot's height. Every eye is inside the room and clears walls by ≥ 25 cm and furniture ≥ 50 cm tall. The first pose is the eye-level shot. It shortens the dolly in 10 cm steps when blocked, and falls back to a pure pan below 40 cm |
| AC-137 | planned | The depth video is 121 frames, 1280×704, 25 fps H.264. A pixel on a static wall seen in two frames keeps its grey level within ±2 when its distance changes by < 1 cm (fixed range: no flicker) |
| AC-138 | planned | "Walkthrough video" is disabled with no focused room. With one, it runs a `render-from-depth` first frame, uploads the first frame and the depth video, queues `walkthrough-ltx23-ic-lora` with both prompt nodes filled, and shows a `walkthrough` job card through the steps in §4 |
| AC-139 | planned | When the job finishes, the viewer opens and plays the clip. Download saves `comfysims-walkthrough-<room>.mp4`; Close and Esc close it |
| AC-140 | planned | Moving an item in the room marks that room's clip stale. "Regenerate" queues a new job; nothing regenerates automatically |
| AC-141 | planned | The `walkthrough_video` MCP tool returns the mp4 path and the first frame as image content, and is listed in `mcp-tools.json` |
| AC-142 | planned | `walkthrough-ltx23-ic-lora.json` lints against the Cloud catalog snapshot and carries every `roomfit:` tag in §7 |
| AC-143 | planned | The backend capability check (M10) names the missing LTX/Gemma/MoGe files when a backend lacks them, and the button shows that message |
| AC-144 | manual | Recording on real Comfy Cloud: a walkthrough of the demo living room and bedroom, played in the viewer. Evidence goes in `docs/recordings/` |

## 9. Test plan

| AC | Level |
| --- | --- |
| AC-136 | vitest on `walkthroughPath` (pure), with a wall-blocked and a furniture-blocked room fixture |
| AC-137 | e2e: decode the uploaded mp4 in the browser (WebCodecs), read back two frames |
| AC-138, AC-139, AC-140 | e2e with the fake ComfyUI, which returns a fixture mp4 and a first-frame PNG |
| AC-141 | e2e via the MCP SDK client (as AC-67) |
| AC-142 | vitest (as AC-68) |
| AC-143 | e2e with a fake `object_info` missing the LTX checkpoint |
| AC-144 | manual recording |

## 10. Risks and open questions

Risks
- **Encoding in the browser.** Producing an mp4 needs WebCodecs (Chrome and Safari have it) plus a muxer. Firefox lacks H.264 encoding in some builds. Mitigation: open question 1.
- **Runtime and cost.** One LTX 22B run per clip. It is opt-in and labelled stale, as with M5, and the job card shows the expected time.
- **Items leaving the frame drift** (spike found). The path pans only 25° to limit how much leaves the view.
- **The template can change.** Cloud templates are re-published, so the workflow is pinned as our own API-format file (§7), not a template reference.

Open questions (recommended answers in bold)
1. **Encoder:** **WebCodecs `VideoEncoder` + `mp4-muxer`** (a ~30 KB dependency, MIT). The alternative is uploading 121 PNGs and loading them as an image batch: no new dependency, but 121 uploads per job and a workflow that no longer matches the template.
2. **Keep the MoGe branch?** **Keep it for M17**, because it is what passed the spike. Feeding our depth straight in as `control_images` (skipping MoGe) is likely better and faster, but it needs its own spike run. That would be a follow-up after AC-144.
3. **Path:** **one fixed dolly + pan per room** for M17. Recording a walk as the path follows after the pipeline ships.
4. **Spike credits:** 3 Cloud generations already spent, at 0 credits (no paid API nodes; GPU time only).

## Change log

- 2026-10-20 Draft from Dante's choice of the walkthrough video as M17. Spike run the same day (3 Cloud jobs), PASS on the second attempt. In review.
