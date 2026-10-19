# roomfit — agent rules

Real-scale furniture for ComfyUI: product photo + listed dimensions → exact-size GLB → placed in a room → render passes back into ComfyUI.

## Start here

1. Read the spec you are working on in `spec/` (M1–M7 are implemented; each spec's AC table is the definition of done). `spec/README.md` explains the statuses.
2. Read `docs/adr/` for decisions you must not silently reverse, and `docs/harness.md` for how you are checked.
3. Run `pnpm verify` before and after your change. It prints which acceptance criteria (ACs) pass.

## Two kinds of session

- **Spec session** (human present, started with `ROOMFIT_SPEC_SESSION=1 claude`): may change `spec/`, `acceptance/`, `fixtures/`, `harness/`, `.claude/`. Every decision made here gets an ADR and a journal entry.
- **Implementation session** (default): makes acceptance tests pass. The guard hook blocks edits to the paths above. If a spec, test or fixture is wrong, stop and reply starting with `BLOCKED:` and say what a human should change. Do not work around it.

## Done means

- `pnpm verify` prints `VERIFY PASS`. The Stop hook runs it for you and sends you back (up to 3 times) when it fails.
- The AC you worked on moved from `TODO` to `PASS` (or `EARLY` if the spec still says `planned`).
- To look at what you built, run `pnpm see --help` and read the PNG it writes.
- Units are centimeters everywhere in our code; glTF files are meters. Convert only at the GLB boundary.

## Layout

- `packages/schema` — room layout contract (zod). `pnpm schema:export` regenerates `spec/contracts/room-layout.schema.json`.
- `packages/` — fit, placement, ComfyUI client (`packages/comfy`).
- `web/` — the editor and home studio (React + react-three-fiber); its API is `window.roomfit` (`spec/contracts/editor-api.ts`).
- `mcp/` — the roomfit MCP server (`pnpm mcp`), bridged to the open editor.
- `nodes/roomfit` — the ComfyUI node pack (Python).
- `workflows/` — ComfyUI workflows; `workflows/sets.json` picks one per backend and job kind.
- `acceptance/` — one file per area; test names start with the AC id.
- `harness/` — `verify.mjs`, hooks, fakes, measuring tools, and the harness's own tests.
- `fixtures/` — shared test inputs every agent sees the same way.

## Style

TypeScript strict, no `any`, pure functions for geometry, outcomes as data instead of throws at boundaries. English in code, commits and specs.

No code comments. Say it with names, extracted functions and types; the only allowed comment is a one-line JSDoc on an exported API. Rationale goes in the ADR or the commit message. Remove existing comments in any function you touch.
