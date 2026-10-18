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

- Workspace rail, top: backend chip **"Cloud · ready"** / **"Local · ready"** / **"… · checking…"** / **"… · unreachable"** / **"… · N workflows unavailable"**. Click → menu with **Cloud**, **Local**, a URL field for Local (default `http://127.0.0.1:8188`), **"Check again"**. Cloud is disabled with "No Cloud key in .env.local" when the server has none.
- Job card: **"Workflow"** button on every card (any state). Panel title "<workflow name> · <backend>"; sections Nodes, Filled inputs, buttons **"Download JSON"**, **"Open in ComfyUI"**, **"Close"**.
- Disabled actions show the reason inline with **"View workflow"**.

## 5. Behaviour rules

- The proxy target becomes runtime state on the dev server: `POST /__roomfit/backend { kind, url? }` (same-origin only, 127.0.0.1 only); the key is attached only when `kind = cloud`. Default at start: the env var, as today.
- Workflow sets: `workflows/local/*.json` and `workflows/cloud/*.json`, one per job kind (`product`, `render`, `photo3d`, `pano360`). Render is shared if it runs on both.
- Readiness: on switch and on "Check again", fetch the backend's `/object_info` (Cloud: `/api/object_info`) and lint each workflow of that set against it (same linter as AC-8/AC-54). A kind is available only when its workflow lints clean.
- Switching never cancels running jobs; each job records `backend` and polls the backend it started on.
- A job records the exact graph it submitted (after roomfit filled inputs). "Download JSON" saves that; "Open in ComfyUI": Local → opens `<url>/` in a new tab and copies the graph to the clipboard with "Paste into ComfyUI (Ctrl+V)"; Cloud → same with `https://cloud.comfy.org/`.
- MCP `get_backend` returns `{ kind, url, ready, unavailable }`; there is no `set_backend` tool.

## 6. Contract and data changes

- `Job` gains `backend: { kind: 'local' | 'cloud', url }`, `workflow: { kind, file, submitted }` (the submitted API graph).
- Editor API: `backend(): BackendState`, `setBackend({ kind, url? }): Promise<BackendState>`, `jobWorkflow(jobId)`, `state().backend`.
- `spec/contracts/mcp-tools.json`: `get_backend`.
- New `workflows/local/` (product → 3D with a locally installable model; candidate: Hunyuan3D 2.x / TRELLIS, chosen in the spike).

## 7. ComfyUI workflows

- Local product → 3D: **spike needed** — which open image-to-3D runs on a typical local ComfyUI (Dante's Mac) within reason, and lints against the local catalog snapshot.
- Local photo → 3D: MoGe nodes are in ComfyUI core recently; check against the local snapshot.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-70 | planned | Switching backend in the app changes where new jobs queue (fake local vs fake cloud servers), without restarting, and running jobs keep polling where they started |
| AC-71 | planned | The Cloud key is attached only to Cloud requests and never reaches the browser (extends AC-25) |
| AC-72 | planned | Readiness: a backend missing a workflow's node marks that kind unavailable with the node name; its action is disabled with the reason |
| AC-73 | planned | Every job card opens its workflow: node list, filled inputs, and "Download JSON" returns exactly the graph that was submitted |
| AC-74 | planned | `get_backend` MCP tool returns kind, url, ready and unavailable kinds |
| AC-75 | planned | Each workflow in `workflows/local/` lints against the local catalog snapshot, each in `workflows/cloud/` against the Cloud snapshot |
| AC-76 | manual | Recording: the same product placed on Local and on Cloud, with the workflow panel opened for each |

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
