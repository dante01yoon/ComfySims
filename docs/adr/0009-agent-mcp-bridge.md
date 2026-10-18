# ADR-0009: Agents act on the open editor through a local bridge; Comfy images travel by input name

Date: 2026-10-18

## Status

Accepted (with spec M4)

## Context

Agents generate images and models with the Comfy Cloud MCP, but placing, fitting and rendering live in the roomfit editor. M4 lets an agent use both.

## Decision

- **A stdio MCP server (`pnpm mcp`) talks to the open editor through a websocket bridge on the dev server**, not to a layout file. The user sees every agent action live; the agent's edits share the editor's undo history, labelled `mcp:<tool>`.
- **Bridge security:** 127.0.0.1 only, a random token written to `.harness/bridge-token` per dev-server start, foreign origins rejected (4403), wrong tokens rejected (4401). The Comfy key never passes through the MCP server.
- **Images from the Comfy Cloud MCP arrive by Comfy input name** (`use_previous_output` → `add_product({ image: { comfyInputName } })`), so nothing is downloaded and re-uploaded.
- **Tools wait for jobs** (up to 15 min) and return results; `get_jobs` exists for agents that prefer polling.
- **Tool contract pinned** in `spec/contracts/mcp-tools.json`; AC-56 compares the live tool list with it.

## Rejected

- Headless layout-file mode: agents would edit something the user does not see; the demo and the editor's checks would diverge.
- Re-exposing Comfy generation from roomfit: duplicates the Comfy Cloud MCP.

## Consequences

- An editor tab must be open (and not throttled in the background) for tools to work.
- Known gap (2026-10-18, impl-17): `pnpm see` starts its own dev server and overwrites the shared bridge token, disconnecting a running agent until the editor reloads. Fix: token file per port.
- Progress notifications for long tools are not implemented yet.
