# M6 — Choose Local or Cloud in the app, and see the workflows behind every job

| | |
| --- | --- |
| Status | Approved (2026-10-18) |
| Date | 2026-10-18 |
| Owner | Dante |
| Decisions | — |

## 1. Why

**The backend is fixed when the dev server starts.** `web/vite.config.ts` proxies `/comfy` to `ROOMFIT_COMFY_URL` (default local `http://127.0.0.1:8188`), with `COMFY_CLOUD_API_KEY` from `.env.local` added server-side. Switching means restarting with another env var; the app does not show which one it is using. Dante asked (2026-10-18): "로컬이랑 클라우드 선택해서 사용할 수 있는건가? MCP도 연결할 수 있고? 안에 사용된 워크플로우들도 같이 볼 수 있어도 좋겠다."

**The editor always sends the Cloud workflows.** `web/src/editor.ts` imports `workflows/cloud/product-to-glb-pixal3d.json` and `photo-to-3d-moge.json`; a local ComfyUI without Pixal3D/MoGe nodes rejects them. Local use needs its own workflow set and a check that it can run.

**Workflows are invisible.** The JSON files in `workflows/` are the product's core (lecture point: ComfyUI does the generation, roomfit does the measuring), but a user only sees a progress card. Seeing the exact graph a job ran, and opening it in ComfyUI, is how a ComfyUI user learns, trusts and modifies it.

**MCP.** The roomfit MCP already follows whatever the editor uses. The Comfy Cloud MCP is Cloud-only; a local agent flow uses roomfit's own tools (which queue on the chosen backend).

## 2. Goals and non-goals

Goals
- A backend switch in the app: **Local** (URL, default `http://127.0.0.1:8188`) or **Cloud** (uses the key in `.env.local`), with live status.
- Each backend has its own workflow set; before a job runs, the app knows whether the backend has the nodes and models it needs.
- Every job card shows the workflow it ran: node list, the exact submitted graph (download), and "Open in ComfyUI".
- MCP: `get_backend` (read-only) and a `backend` field in `get_jobs`; switching stays a user action.

Non-goals (M6)
- Entering or storing the Cloud key in the browser (stays in `.env.local`, server-side; ADR-0006).
- Editing workflows inside roomfit (open them in ComfyUI instead).
- Installing missing local models for the user (show what is missing and where to get it).

## 3. Scenarios

1. **Switch to local.** Dante opens the backend menu in the workspace rail, picks Local. The status reads "Local · checking…" then "Local · ready" (or "Local · 2 workflows unavailable"). New jobs run there; running Cloud jobs finish on Cloud.
2. **Missing nodes.** On a local ComfyUI without Pixal3D, "Add product" shows "Product → 3D needs nodes this ComfyUI does not have: Pixal3D… · View workflow" and is disabled; render still works.
3. **See the workflow.** On a finished render card, "Workflow" opens a panel: workflow name and file, backend, a node list (title, class), the inputs roomfit filled (depth image, prompt, seed), "Download JSON" and "Open in ComfyUI".
4. **Agent.** An agent calls `get_backend` → `{ kind: "local", url, ready, unavailable: ["product"] }` and plans accordingly.

## 4. Screens and states

- Workspace rail, top: a backend chip button whose name is exactly **"Cloud · ready"** / **"Local · ready"** / **"<kind> · checking"** / **"<kind> · unreachable"** / **"<kind> · N workflows unavailable"**. Clicking it opens a small menu: **"Use Cloud"**, **"Use Local"**, a text field **"Local ComfyUI URL"** (default `http://127.0.0.1:8188`), **"Check again"**. "Use Cloud" is disabled with the title "No Cloud key in .env.local" when the server has none.
- Job card: **"Workflow"** button on every card (any state). It opens a dialog named **"Workflow"** showing the file (e.g. `render-from-depth.json`) and backend ("Cloud"/"Local"), the node list (title and class of each node), the inputs roomfit filled, and buttons **"Download JSON"**, **"Open in ComfyUI"**, **"Close"**.
- Actions that the current backend cannot run are disabled, with a title naming what is missing (node classes or model files).

## 5. Behaviour rules

- The dev server owns the current backend: `GET/POST /__roomfit/backend` (`{ kind, url? }`; requests whose `Origin` is not the dev server get 403; 127.0.0.1 only). Env: `ROOMFIT_CLOUD_URL` (default `https://cloud.comfy.org`), `ROOMFIT_LOCAL_URL` (default `http://127.0.0.1:8188`), `COMFY_CLOUD_API_KEY`; the starting backend is Cloud when `ROOMFIT_COMFY_URL` equals the Cloud URL, else Local at `ROOMFIT_COMFY_URL`. The key is attached only to requests that go to the Cloud URL. A newly opened editor shows the server's current backend.
- Workflow sets: `workflows/sets.json` maps each backend and job kind (`product`, `render`, `photo3d`, `pano360`) to a file under `workflows/`. Local's MoGe workflow is `workflows/local/photo-to-3d-moge.json` (no `refine_steps`, which older ComfyUI lacks).
- Readiness: on switch and on "Check again", fetch the backend's `/api/object_info`. A kind is unavailable when its workflow uses a node class the catalog lacks, or a string value of an input whose catalog spec is an option list — **including an empty one**, which is how ComfyUI reports a model folder with nothing installed — that is not in that list (image-upload inputs excepted); `missing` lists those class or file names. **On Cloud only node classes count**: Cloud's `/api/object_info` omits model files it runs (Pixal3D, Trellis 2, DINOv3 are absent from its lists, yet the product workflow runs there), so model files are checked on Local only. The check is `missingFromCatalog(workflow, catalog, backendKind)` in `packages/comfy`. Unreachable backend → status `unreachable`.
- Switching never cancels running jobs; each job records `backend` and all of its requests (polls, downloads) go to the backend it started on.
- A job records the exact graph it submitted (after roomfit filled inputs). "Download JSON" saves that; "Open in ComfyUI": Local → opens `<url>/` in a new tab and copies the graph to the clipboard with "Paste into ComfyUI (Ctrl+V)"; Cloud → same with `https://cloud.comfy.org/`.
- MCP `get_backend` returns `{ kind, url, ready, unavailable }`; there is no `set_backend` tool.

## 6. Contract and data changes

- `packages/schema`: `BackendKind = 'local' | 'cloud'`; `Job.backend?`.
- Editor API (`spec/contracts/editor-api.ts`): `BackendState { kind, url, status, unavailable: { kind, missing }[], cloudConfigured }`, `JobWorkflow { file, backend, submitted }`; `backend()`, `setBackend({ kind, url? })`, `checkBackend()`, `jobWorkflow(jobId)`, `state().backend`.
- `spec/contracts/mcp-tools.json`: `get_backend` → `{ kind, url, ready, unavailable: JobKind[] }`.
- `workflows/sets.json`, `workflows/local/photo-to-3d-moge.json`.
- Harness: a second fake ComfyUI on :8196 (storage :8195) acting as an older local ComfyUI (no MoGe nodes, only an SDXL ControlNet installed); both fakes serve `/api/object_info` and `/__last-prompt`.

## 7. ComfyUI workflows

- Local product → 3D stays `workflows/product-to-glb.json` (Hunyuan3D 2 + RoomfitFitMesh from the node pack) until the local spike picks a better open model; readiness reports it unavailable on a ComfyUI without those nodes or models.
- Local photo → 3D: `workflows/local/photo-to-3d-moge.json`.
- Finding while writing the sets: the pinned local ComfyUI has every class the Cloud workflows use (Pixal3D, MoGe…), so the real Local/Cloud difference is installed model files, the roomfit node pack, and node input versions (`refine_steps`).

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-70 | active | Switching backend in the app changes where new jobs queue (fake local vs fake cloud servers), without restarting, and running jobs keep polling where they started |
| AC-71 | active | The Cloud key is attached only to Cloud requests and never reaches the browser (extends AC-25) |
| AC-72 | active | Readiness: a backend missing a workflow's node marks that kind unavailable with the node name; its action is disabled with the reason |
| AC-73 | active | Every job card opens its workflow: node list, filled inputs, and "Download JSON" returns exactly the graph that was submitted |
| AC-74 | active | `get_backend` MCP tool returns kind, url, ready and unavailable kinds |
| AC-75 | active | Each workflow in `workflows/local/` lints against the local catalog snapshot, each in `workflows/cloud/` against the Cloud snapshot |
| AC-76 | manual | Recording: selective use — a render on Cloud and a 3D photo on a real local ComfyUI in the same editor, with unavailable kinds named and the workflow dialog opened for each (scope changed 2026-10-18 with Dante from "the same product on both", which needs ~50 GB of local models; evidence: `docs/recordings/demo-ac76-local-cloud.md`) |

## 9. Test plan

| AC | Level |
| --- | --- |
| AC-70, AC-72, AC-73 | e2e with two fake ComfyUI servers (one missing a node) |
| AC-71 | e2e: request log of both fakes + browser network log has no key |
| AC-74 | e2e via MCP SDK client |
| AC-75 | vitest |
| AC-76 | manual recording |

## 10. Risks and open questions

Risks
- Local 3D generation quality/speed on a Mac may be far below Cloud → spike first; Local may launch with product → 3D marked unavailable.
- Runtime proxy switching is a new server endpoint → same-origin + 127.0.0.1 checks as the MCP bridge (ADR-0009).

Open questions — settled 2026-10-18 on the recommended answers (Dante: "Approve M6 on the recommended answers"):
1. The switch lives in the workspace rail chip.
2. Local product → 3D: decided by a spike during M6; until it passes, Local marks product → 3D unavailable (AC-72 covers that state).
3. "Open in ComfyUI": open tab + copy graph to clipboard; ComfyUI template packaging is a follow-up.
4. Agents get read-only `get_backend`; no `set_backend`.

## Change log

- 2026-10-18 Draft, from Dante's questions about Local/Cloud, MCP and seeing workflows.
- 2026-10-18 Approved on the recommended answers; implement after M5.
- 2026-10-18 Found against real Comfy Cloud (AC-76 recording): its catalog omits runnable model files, so the stricter rule marked Cloud's product workflow unavailable. Model files are now checked on Local only; the real Cloud catalog is a fixture (`fixtures/catalogs/comfy-cloud-live.json`).
- 2026-10-18 Found against a real local ComfyUI with no models: the first rule skipped empty option lists, so a ComfyUI with nothing installed looked ready for 3D photos. Rule fixed; the real catalog is now a fixture (`fixtures/catalogs/comfyui-no-models.json`, AC-72); the fakes install exactly the models the workflows use.
- 2026-10-18 Spec session: workflow-set manifest, local MoGe variant, Cloud catalog classes for product/render, backend contracts, second fake ComfyUI, AC-70~75 tests; ACs active.
