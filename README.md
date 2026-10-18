# roomfit

**Does this sofa fit my living room?** Drop in a product photo and its listed size. roomfit turns it into a 3D model on ComfyUI or Comfy Cloud, fits it to the exact listed size, places it in your room or a whole house, checks it against walls and other furniture, and renders the room back to a photo.

![home studio](docs/recordings/media/studio-grid.jpg)

- **Home studio** — a cut-away 3D house with real materials, landscape and Reading / Work / Movie / Evening light presets. All 15 pieces in the demo were generated from product photos on Comfy Cloud. [video](docs/recordings/media/roomfit-studio.mp4)
- **Live Comfy Cloud run** — photo → 3D → fitted → placed → rendered, from the editor, in 90 seconds. [video](docs/recordings/media/roomfit-cloud-live.mp4)

## What it does

| | |
| --- | --- |
| Real size | Generated meshes come out at arbitrary scale and turned to the photo's angle. roomfit turns them to their smallest footprint and fits them to the listed width × depth × height (`exact`, `uniform` or `auto`), with a distortion report. |
| Real rooms | Box rooms or floor plans with walls, doors, windows and zones. Collisions and wall checks always use the listed size, never the mesh. |
| ComfyUI both ways | 2D → 3D (product photo to model) and 3D → 2D (depth, normal and mask passes into a ComfyUI render). Local ComfyUI or Comfy Cloud through the same client; your API key stays on the local server. |
| Node pack | `RoomfitFitMesh` fits any ComfyUI `MESH`, and the pack serves the editor at `/roomfit/` on your ComfyUI. |

## Quick start

```bash
pnpm install
pnpm web:dev                      # editor on http://127.0.0.1:5179
```

To use Comfy Cloud, put your key in `.env.local` (git-ignored) and point the proxy at the Cloud:

```bash
echo 'COMFY_CLOUD_API_KEY=…' > .env.local
ROOMFIT_COMFY_URL=https://cloud.comfy.org pnpm web:dev
```

For local ComfyUI, link `nodes/roomfit` into `custom_nodes/`, run `pnpm web:build:nodepack`, start ComfyUI and open `/roomfit/`.

## How it is built

roomfit is built spec-first by coding agents inside a harness, and the whole process is recorded:

- `spec/` — milestone specs; every acceptance criterion (AC) is owned by tests. `pnpm verify` maps test results back to the AC table.
- `harness/` — Claude Code hooks: agents cannot edit specs, tests, fixtures or the harness, and cannot stop until `pnpm verify` passes. Includes a fake Comfy Cloud and a real local ComfyUI boot.
- `docs/adr/` — every decision and what was rejected.
- `docs/recordings/` — each implementation session (prompt, time, cost, what the agent reported) and the demos.
- `docs/journal/` — the build diary (Korean).

## License

GPL-3.0, same as ComfyUI. See [LICENSE](LICENSE).
