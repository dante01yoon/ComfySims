# M4 — Agents furnish the house: a roomfit MCP server that works with the Comfy Cloud MCP

| | |
| --- | --- |
| Status | Approved (2026-10-18) |
| Date | 2026-10-18 |
| Owner | Dante |
| Decisions | ADR-0009 (to be written on approval) |

## 1. Why

**Agents can already make the pieces, but not put them in the house.** The Comfy Cloud MCP (`https://cloud.comfy.org/mcp`, used throughout this project) lets an agent generate product photos, 3D models and renders. But everything after that — fitting to the listed size, finding a spot against a wall, checking collisions, rendering a room at eye level — lives in the roomfit editor, which an agent can only reach by driving a browser. Evidence: furnishing the demo house (2026-10-18) took a hand-written script (`demo/furnish-house.ts`) plus manual MCP calls (`use_previous_output` ×14) to move images between the two worlds.

**The project is about how Dante uses agents.** A request like "add a reading corner to the bedroom" that an agent completes with two MCP servers — Comfy for generation, roomfit for the house — while the user watches the editor update is both the product's most natural interface and the lecture's best demo.

## 2. Goals and non-goals

Goals
- A local roomfit MCP server whose tools act on the editor the user has open, live.
- Images made with the Comfy Cloud MCP go into roomfit by their Comfy input name, without downloading and re-uploading.
- An agent can see what it did: a screenshot tool and structured house state.

Non-goals (M4)
- A hosted/remote roomfit MCP (local stdio only).
- Acting on a layout file with no editor open (tools fail with a clear message instead).
- Re-exposing Comfy Cloud generation through roomfit (agents use the Comfy Cloud MCP for that).
- Multi-user or multi-tab editing (one connected editor at a time; the newest tab wins).

## 3. Scenarios

1. **Reading corner.** In Claude Code with both MCPs connected, Dante says "add a reading corner to the bedroom: an armchair and a floor lamp, Scandinavian". The agent generates two product photos with the Comfy Cloud MCP, turns them into Comfy inputs (`use_previous_output`), calls roomfit `add_product` with each input name, listed size and room "Bedroom"; the open editor shows two job cards, then both pieces against bedroom walls. The agent calls `screenshot` to check, then `render_room("Bedroom")` and reports the image.
2. **Rearrange.** "Move the desk to the other office wall and rename Office to Studio." The agent reads `get_house`, calls `move_item`/`rotate_item` (snapping and wall checks apply), `rename_room`, and verifies with `get_house` problems = none.
3. **No editor.** The agent calls a tool while no editor tab is open; it gets "No roomfit editor is connected. Open http://127.0.0.1:5179 and try again."

## 4. Screens and states

- Editor: a small "Agent connected" badge in the workspace rail while an MCP client is attached; actions taken by the agent appear in the editor exactly like the user's (job cards, selection, undo history), each undo step labelled with the tool name.
- No new agent UI beyond the badge; the agent's own client shows its tool calls.

## 5. Behaviour rules

- Architecture: `pnpm mcp` starts the roomfit MCP server on stdio. It connects to the dev server's local bridge (`ws://127.0.0.1:5179/__roomfit-bridge`, 127.0.0.1 only, token read from `.harness/bridge-token`, created by the dev server). The editor tab connects to the same bridge and executes calls through `window.roomfit`. One request at a time per tool call; timeouts 10 s for state tools, 15 min for job tools.
- Tools (inputs validated with zod; results are JSON text plus, for images, MCP image content):
  - `get_house` → rooms (id, name, item count), items (id, asset, room, position, rotation), assets, problems (collisions, out of bounds), view, scene, focused room.
  - `list_assets` → library rows (id, name, size, source, fit).
  - `place_asset(assetId, room)` · `move_item(itemId, x, z)` · `rotate_item(itemId, degrees)` · `remove_item(itemId)` · `rename_room(room, name)` · `focus_room(room | null)` · `set_scene(preset)` · `set_view(view)` → the editor API result.
  - `add_product({ image, name, width, depth, height, room?, mode? })` where `image` is `{ comfyInputName }` (from the Comfy Cloud MCP), `{ path }` (local file) or `{ base64 }` → waits for the job; returns item id and fit report.
  - `render_room({ room?, prompt?, preset? })` → waits; returns the image (MCP image content) and a local file path.
  - `photo3d({ renderJobId } | { path })` → waits; returns job id.
  - `screenshot()` → PNG of the current view (MCP image content).
  - `get_jobs()` → the job cards' data.
- Rooms are addressed by id or by name (case-insensitive).
- `add_product` with `comfyInputName` skips the upload step: the editor's product request gains `imageName` as an alternative to `imageBase64`.
- The Comfy key never passes through the MCP server (the editor's ComfyUI traffic still goes through the dev proxy).

## 6. Contract and data changes

- `spec/contracts/mcp-tools.json` is the tool contract (names, required inputs, input types); the server's live tool list must match it (AC-56).
- Editor API additions: `screenshot(): Promise<string>` (PNG data URL of the current view), `setActionLabel(label | null)` (the bridge labels the next edits), `state().undoLabels` (labels of the undo stack, newest last; user edits are `editor`), `state().agentConnected`.

- `spec/contracts/mcp-tools.json`: the tool list with names, descriptions and JSON schemas (generated from the zod definitions; drift-checked like the layout schema).
- `ProductRequest`: `imageBase64` becomes optional; new optional `imageName` (an existing ComfyUI input). Exactly one must be set.
- Undo history entries gain an optional label.

## 7. ComfyUI workflows

No new workflows. Uses `workflows/cloud/product-to-glb-pixal3d.json`, `render-from-depth.json`, `photo-to-3d-moge.json`.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-56 | active | `pnpm mcp` serves the tools in `spec/contracts/mcp-tools.json` over stdio; the contract file matches the zod definitions |
| AC-57 | active | With an editor open, `get_house` matches `window.roomfit.state()` and `place_asset`/`move_item`/`rename_room`/`focus_room` change the open editor, undoably, with the tool name on the undo step |
| AC-58 | active | `add_product` with a Comfy input name queues the product workflow with that name and no upload, and returns the placed item |
| AC-59 | active | `render_room` and `screenshot` return PNG image content; `render_room` also saves the file |
| AC-60 | active | With no editor connected every tool fails with the "No roomfit editor is connected…" message; the bridge refuses connections without the token or from other hosts |
| AC-61 | manual | Recording: Claude Code with the Comfy Cloud MCP and the roomfit MCP completes scenario 1 from one sentence |

## 9. Test plan

| AC | Level |
| --- | --- |
| AC-56 | vitest: spawn `pnpm mcp`, list tools with the MCP SDK client, compare to the contract |
| AC-57 ~ AC-59 | e2e: Playwright opens the editor, an MCP SDK client in the test calls tools through the real bridge, the fake ComfyUI answers jobs |
| AC-60 | vitest: no editor; bad token; non-local origin |
| AC-61 | recorded Claude Code session (`claude -p` with both MCP servers configured) |

## 10. Risks and open questions

Risks
- Long-running tool calls (product ~60 s) may hit client timeouts; tools report progress notifications and the job id so an agent can poll `get_jobs`.
- A local bridge is a new attack surface; 127.0.0.1 only, token, no file system access beyond `path` inputs the user's agent provides.

Open questions (settled 2026-10-18 on the recommended answers)
1. Live bridge to the open editor (**recommended**) vs a headless mode on a layout file.
2. `add_product` waits for completion (**recommended**, with progress notifications) vs returns immediately with a job id.
3. Publish the MCP server as an npm package now vs **after M4 is recorded** (recommended).

## Change log

- 2026-10-18 Draft, written after Dante asked to include Comfy MCP integration ("Comfy mcp랑 연동하는 작업도 있음 넣고").
- 2026-10-18 Approved. Dante: "지금까지의 작업사항 기반으로 … 다음 작업도 계속 진행해" — taken as approval on the recommended answers: live bridge to the open editor; tools wait for completion with progress notifications; publish to npm after the M4 recording.

## Bridge details (for implementation and tests)

- Endpoint: `ws://127.0.0.1:5179/__roomfit-bridge?role=editor|agent&token=<token>`. The dev server creates a random 32-hex token at start in `.harness/bridge-token` and serves it to the editor at `GET /__roomfit-bridge/token` (same origin only). Connections without the right token close with code 4401; connections whose `Origin` is not the dev server's (when present) close with 4403; only 127.0.0.1.
- Messages: `{ id, method, params }` → `{ id, result }` or `{ id, error: { message } }`. The editor executes them through `window.roomfit`, wrapping state-changing calls in `setActionLabel('mcp:<tool>')`.
- `pnpm mcp` lists its tools without any editor or dev server; it connects to the bridge on the first tool call (`ROOMFIT_URL`, default `http://127.0.0.1:5179`).
- No editor connected (or no dev server): the tool result is an error whose text starts with "No roomfit editor is connected".
- `render_room` saves the PNG to `.harness/renders/<jobId>.png` and returns that path in its text content.
- Result shapes (JSON text content): `get_house` → `{ rooms: [{ id, name, itemCount }], items: [{ id, assetId, room, position, rotationY }], assets, problems: { collisions, outOfBounds }, view, scene, focusedRoom }`; `place_asset` → `{ itemId }`; `add_product` → `{ itemId, jobId, report }`; `render_room` → `{ jobId, path }` plus image content; `photo3d` → `{ jobId }`; `screenshot` → image content only; failures → `isError: true` with the reason as text.
- The editor shows the text "Agent connected" in the workspace rail while an agent is attached.
