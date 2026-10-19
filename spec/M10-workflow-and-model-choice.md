# M10 — Choose the workflow and the models for every job

| | |
| --- | --- |
| Status | Approved (2026-10-19) |
| Date | 2026-10-19 |
| Owner | Dante |
| Decisions | — |

## 1. Why

**The workflow and models are fixed in code.** `workflows/sets.json` picks one workflow per backend and job kind, and the models inside it are whatever the file says. A ComfyUI user who prefers Hunyuan3D over Pixal3D, a different checkpoint for renders, or their own tuned workflow has to edit repository files. Dante (2026-10-19): "워크플로도 직접 사용자가 선택할 수 있게 해주고 사용하는 모델이나" — let users choose the workflow and the models.

**ComfyUI already tells us the choices.** `/api/object_info` lists the installed model files for every loader input (Local), and roomfit already reads it for readiness (M6). The same catalog can fill model dropdowns.

## 2. Goals and non-goals

Goals
- For each job kind (product → 3D, room render, 3D photo, 360° view) the user picks a workflow: any built-in workflow made for that kind, or their own API-format workflow JSON.
- For the chosen workflow, the user picks the model file of each loader input, from the backend's catalog.
- Choices live in the layout (so a shared layout reproduces its renders) and apply to the next jobs; agents can read and set them over MCP.

Non-goals (M10)
- Editing workflow graphs inside ComfySims (open them in ComfyUI; M6).
- Downloading models.
- Per-job overrides from the job card (the choice is per kind).

## 3. Scenarios

1. **Use Pixal3D on my Mac.** Dante's local ComfyUI has Pixal3D installed. In the rail's **Workflows** section he sets "Product → 3D workflow" to `cloud/product-to-glb-pixal3d.json`; the next product runs that graph locally.
2. **A different checkpoint.** Under "Room render workflow" he changes the model "Load Z-Image Turbo · unet_name" to another installed file; the next render's submitted graph (Workflow dialog, M6) shows it.
3. **My own workflow.** He adds `my-render.json` (exported from ComfyUI in API format) for room renders. It carries the `roomfit:*` tags, so it becomes an option; one without `roomfit:depth` is refused with the missing tags named.
4. **Agent.** `list_workflows({ kind: 'render' })` → options with availability and model slots; `set_workflow({ kind: 'render', workflow, models })`.

## 4. Screens and states

- Workspace rail: a collapsible section **"Workflows"** (a `<details>` whose summary reads "Workflows", collapsed by default). Each select's option values are workflow ids (`render-from-depth.json`, `cloud/product-to-glb-pixal3d.json`, `custom:<name>`). For each kind a select named **"Product → 3D workflow"**, **"Room render workflow"**, **"3D photo workflow"**, **"360° view workflow"**; options are labelled by file (or "Custom · <name>"), with "(unavailable: …)" when the current backend cannot run them.
- Under each workflow select, one select per model slot, named **"<node title> · <input>"**, options = the backend catalog's files for that input plus the workflow's own value.
- **"Add workflow"**: a file field **"Workflow JSON"** and a select **"For"** (job kind); errors show inline ("Missing tags: roomfit:depth").

## 5. Behaviour rules

- Built-in options for a kind: every file that `workflows/sets.json` maps to that kind, on either backend. Default (no choice stored): the current backend's file from `sets.json`.
- Required tags per kind: product `roomfit:product-image`, `roomfit:save`; photo3d `roomfit:photo`, `roomfit:save`; render and pano360 `roomfit:depth`, `roomfit:positive`, `roomfit:negative`, `roomfit:seed`, `roomfit:save`. A custom workflow must be API format (node id → `{ class_type, inputs }`) and carry them; at most 10 custom workflows per layout; names unique.
- Model slots: every string input of the chosen workflow whose name is `name` or ends with `_name` and whose catalog spec on the current backend is an option list. Key `<nodeId>.<input>`; label `<node _meta.title or class_type> · <input>`; options = catalog list ∪ the workflow's value.
- A model choice is applied to the graph before roomfit fills its tagged inputs; the job's `jobWorkflow` (M6) reports the chosen file (or `custom:<name>`) and the submitted graph.
- Availability uses the M6 readiness rule against the chosen workflow; an unavailable choice disables the action with the missing names, as today.
- Setting a model without choosing a workflow stores the kind's current workflow with it. Changing the workflow resets that kind's model choices. Choices and custom workflows are layout data: undoable, saved, loaded.

## 6. Contract and data changes

- `packages/schema`: `RoomLayout.generation?: Partial<Record<JobKind, { workflow: string; models?: Record<string, string> }>>`, `RoomLayout.customWorkflows?: Record<string, { kind: JobKind; graph: ApiGraph }>` (≤ 10).
- Editor API (`spec/contracts/editor-api.ts`): `workflowChoice(kind)`, `setWorkflow(kind, id)`, `setModel(kind, key, value)`, `addCustomWorkflow(kind, name, graph)`.
- MCP: `list_workflows({ kind })`, `set_workflow({ kind, workflow, models? })`.

## 7. ComfyUI workflows

None new. Custom workflows come from users.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-94 | active | The layout schema accepts generation choices and custom workflows, rejects more than 10 custom workflows and unknown job kinds, and loads layouts without them |
| AC-95 | active | `workflowChoice(kind)` lists the kind's built-in workflows with availability on the current backend, defaults to `sets.json`, and lists model slots with the catalog's options |
| AC-96 | active | Choosing a workflow and a model changes the next job's submitted graph, is saved in the layout, survives save/load, and the job's workflow record names the chosen file |
| AC-97 | active | A custom workflow with the kind's tags becomes an option and runs; one missing tags is refused with the missing tags named |
| AC-98 | active | The rail's "Workflows" section shows a workflow select per kind and model selects for the chosen workflow; changing them updates the choice |
| AC-99 | active | MCP `list_workflows` returns the choice for a kind; `set_workflow` sets workflow and models with an `mcp:` undo label |

## 9. Test plan

| AC | Level |
| --- | --- |
| AC-94 | vitest |
| AC-95 ~ AC-98 | e2e with the fake ComfyUIs (Local fake: both product workflows available) |
| AC-99 | e2e via the MCP SDK client |

## 10. Risks and open questions

- Comfy Cloud's catalog omits model files it can run (M6); on Cloud the model select still offers the workflow's own value, so a working default is never lost.
- A custom workflow may need models the backend lacks; readiness reports them like any built-in workflow.

## Change log

- 2026-10-19 Written and approved on Dante's request ("진행해 … 워크플로도 직접 사용자가 선택할 수 있게 해주고 사용하는 모델이나"); feasibility: `/api/object_info` lists model options per loader input (M6).
