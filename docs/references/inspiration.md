# References: projects Dante pointed to, and what ComfySims takes from each

Collected 2026-10-19. Each entry has what it is, how it gets its look (checked by opening the post or live demo), and what it means for ComfySims. Numbers are as seen on that date.

## img2interior v2.2 — Nick (@NickDevFE)

- **Post:** https://x.com/NickDevFE/status/2112200222365684046 (217 likes, 10.3K views). Repo `github.com/img2threejs/img2interior`, live demo `img2threejs.io/living-room/`.
- **What it is:** one reference image becomes an editable Three.js interior: an orbit camera, fabric swaps, curtains you can pull.
- **How it looks so smooth.** Measured on the live demo:
  - **Baked lighting:** the light is baked in Blender (Cycles) into five EXR lightmaps (~280 MB).
  - **Asset weight:** an 88 MB room GLB, plus HDR environments. 383 MB to download, 175 KB of JS.
  - **Camera:** camera presets with eased transitions between them.
  - **Loading screen:** staged steps (manifest → model → lighting → first frame).
- **Limits:** one hand-authored room. Moving furniture would break the baked light.
- **Taken for ComfySims:**
  - Eased camera transitions → done in **M15**.
  - A staged loading screen and light quality from an environment map rather than baking → **M16+**.
  - Material/colour variants tied to product options → later.
  - The 383 MB vs "a few MB" contrast is the M16 optimisation story.
- A reply asked whether an agent can rearrange the layout over MCP. ComfySims already does that.

## 8-million-splat living room — Arun Kurian (@AKurian001)

- **Post:** https://x.com/AKurian001/status/2112207423905931735 (174 likes, 7.6K views)
- **What it is:**
  - A 10-minute 360° walk through a real living room, shot on an Insta360 X5.
  - Processed locally in AirVis Studio (~3 h) into 8 M Gaussian splats, viewed in SuperSplat.
- **Why it looks real:** splats store the photographed colour and light directly, so every angle looks like a photo.
- **Limits:**
  - Frozen: you cannot move or remove furniture.
  - No metric scale.
  - Hours of processing and hundreds of MB.
- **Taken for ComfySims:** "scan your real room, then place exact-size furniture in it" (roadmap **M21**).
  - Calibrate scale from one known length or LiDAR.
  - Render splats with Spark or GaussianSplats3D inside react-three-fiber.
  - Composite them with mesh furniture.

## ComfyArt — jtydhr88 (Terry, Dante's colleague)

- **Post:** https://x.com/jtydhr88/status/2112158299135025641 (63 likes, 3K views at the time). Repo `github.com/jtydhr88/ComfyArt`.
- **What it is:**
  - An open-source AI design canvas on ComfyUI.
  - Runs on your own GPU, or on Comfy Cloud with one setting.
  - Open-weights models only.
  - Bring your own agent (Claude Code, Codex, Qwen Code, DeepSeek Harness, local LLM).
- **Its positioning matches ComfySims closely.** The difference is the video. Its editing:
  - Opens on a big two-line title over a collage of results ("Your design studio, / on your own GPU.").
  - App captures sit in a rounded window on a light background.
  - Bottom caption pills ("Describe it. The agent takes it from there.").
  - Top-left feature chips ("Remove Background", "Split Layers").
  - An honest "2:32 real time · local GPU" badge.
  - A "Bring your own agent." beat with the picker open.
- **Taken for ComfySims:** remake the launch and X videos in this style instead of dark cards with badges.

## "Every house starts as a plan." — Samnang Aing (@SammmAing)

- **Post:** https://x.com/SammmAing/status/2112251300750458983. A polished follow-up to a version that went viral (60K views overnight on Threads and LinkedIn). Built with Claude Opus 5.5.
- **What it is:**
  - A flat architectural floor plan that builds itself into a 3D house as you scroll.
  - Paper texture, dimension lines, room labels with areas.
  - It continues into an eye-level walkthrough with detailed rooms: a fireplace lounge, a wine room, a courtyard tree, a pool terrace.
- **This is ComfySims' own story.** ComfySims already has the real data: walls, doors, windows, rooms and exact-size furniture from a blueprint (M9). M15 adds smooth camera and walking.
- **Taken for ComfySims:** **M17 "the plan builds into the house"**:
  - A scroll- or time-driven sequence: walls extrude, openings cut, floors fade in, furniture settles.
  - The camera descends to eye level and walks through.
  - A drawing-style plan view.
  - Strongest candidate for a viral demo and a landing page.

## Portal jumping through splat worlds — Ian Curtis (@XRarchitect, World Labs)

- **Post:** https://x.com/XRarchitect/status/2112207444101541962 (4.6K likes, 144.8K views)
- **What it is:**
  - Real-time WebGPU portals between Gaussian-splat worlds: a cyberpunk den, the Colosseum, a palace salon.
  - Made with Spark (`sparkjs.dev`, splats for three.js), World Labs worlds and three.js.
- **Taken for ComfySims:**
  - A door in the plan house could open onto the photoreal version of the room: the 360° render extended to a splat world.
  - Spark is the practical renderer for any splat work (with M21).

## How these shaped the roadmap

| Milestone | From |
| --- | --- |
| M15 smooth camera + walk (done) | img2interior's eased cameras; "you can't walk around" |
| M16 light assets, no stalls | img2interior's 383 MB as the counter-example; the M15 profiles |
| M17 plan builds into the house | Samnang Aing |
| Launch video remake | jtydhr88's ComfyArt video |
| M21 scan / splats, portals | Arun Kurian, Ian Curtis |
