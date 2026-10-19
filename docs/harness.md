# Harness

The harness is the working environment agents run in. It keeps the definition of done out of the agent's reach, makes the agent check its own work before it stops, and gives it ways to measure and look at what it built. Same roles as [codex-harness-kit](https://github.com/dante01yoon/codex-harness-kit), rebuilt with Claude Code hooks.

## Roles

| Role | Part | What it does |
| --- | --- | --- |
| Tell | `AGENTS.md` (loaded through `CLAUDE.md`) | Specs are the definition of done; spec vs implementation sessions; the `BLOCKED:` hand-off |
| Block | PreToolUse hook `harness/hooks/guard.mjs` | Denies edits to `spec/`, `packages/schema/`, `acceptance/`, `fixtures/`, `harness/`, `.claude/`, `vitest.config.ts`, `playwright.config.ts`, `package.json` unless `ROOMFIT_SPEC_SESSION=1` |
| Check | Stop hook `harness/hooks/stop-verify.mjs` → `pnpm verify` | Runs every gate below and maps test results back to acceptance criteria. On failure the agent is sent back with the report |
| Stop | Retry limit in the Stop hook | After 3 failed attempts, or a reply starting with `BLOCKED:`, the agent may stop; the report stays in `.harness/last-verify.json`. A clean working tree skips verify |
| Measure | `harness/tools/measure-glb.ts`, `harness/tools/lint-workflow.ts` | "Is this the right size?" and "will ComfyUI accept this workflow?" as numbers and lists an agent can read |
| See | Playwright e2e, `pnpm see` | Editor behavior through `window.roomfit`; `pnpm see --layout=… --view=… --focus=… --scene=…` screenshots its own editor to `.harness/see/` with console errors and a state summary |
| Record | `harness/tools/run-session.mjs`, `write-recording.mjs` | Runs a headless implementation session (`claude -p`, stream-json) and writes its transcript, turns, cost and final message to `.recordings/` and `docs/recordings/impl-NN-*.md`. Refuses to start when the harness's own tests fail |

## `pnpm verify` gates

| Gate | Command |
| --- | --- |
| port check | 5179, 8199, 8197, 8196, 8195 must be free (a leftover dev server would make e2e test the wrong code) |
| contract drift | `packages/schema` → `spec/contracts/room-layout.schema.json` must match |
| typecheck | `tsc --noEmit`, including `acceptance/contract-types.ts`, which asserts that implementation types equal contract types |
| tests | Vitest: `acceptance/*.test.ts`, package unit tests, `harness/self-test/` |
| editor build | `vite build web` |
| e2e | Playwright against the dev server with two fake ComfyUIs |
| node pack build | the editor built into `nodes/roomfit/editor` |
| python acceptance | the node pack inside a real local ComfyUI (`--base-directory .harness/comfy-base`), when one is installed |

Then it prints every AC of every spec with its status:

| Mark | Meaning |
| --- | --- |
| `PASS` | active AC with passing tests and no failing one |
| `FAIL` / `NO TEST` | active AC that fails or has no test — verify fails |
| `TODO` / `TODO*` / `EARLY` | planned AC with no test / failing tests (expected) / passing tests |
| `MANUAL` | checked by a recording; the spec links the evidence |

## Test doubles that come from real data

- `harness/tools/fake-comfy.mjs` — a Comfy Cloud v1 API stand-in (upload, queue, `/api/jobs`, signed-storage redirect, `/api/object_info`). Two run during e2e: `:8199` as Cloud (requires the API key) and `:8196` as an older local ComfyUI (no MoGe nodes, only an SDXL ControlNet). Knobs: file names containing `fail` or `slow`. Probes: `/__requests`, `/__prompts`, `/__last-prompt`.
- `spec/contracts/comfyui-object-info.json`, `comfy-cloud-object-info.json` — pinned node catalogs (local ComfyUI; Comfy Cloud via the comfy-cloud MCP) for workflow lint.
- `fixtures/catalogs/` — real `/api/object_info` responses: a local ComfyUI with no models, and Comfy Cloud. Readiness rules are tested against these, because hand-made fakes hid two bugs (an empty model list, and Cloud listing fewer models than it runs).
- `fixtures/` — GLBs with known sizes and orientations, layouts, a panorama.

## The harness tests itself

`harness/self-test/` checks the guard's block/allow table, the GLB measurer, and the workflow linter. The session runner will not start an implementation session while these fail.

## What the records show (as of 2026-10-18)

- 22 implementation sessions, 255 minutes, $49.53. The Stop hook never had to send an agent back: agents run `pnpm verify` before they finish.
- 8 sessions ended with `BLOCKED:`; all 8 were mistakes in what the spec session wrote (a test, a contract, a fake). Each time the agent named the file, the line and a fix instead of working around it.
- Habit that cut those down: at the end of every spec session, run `pnpm verify` and check that only the expected ACs are red before starting an implementation session.

## Limits

- The Bash guard pairs "any write-like command" with "any protected path mentioned", so a compound command that reads a protected file and writes elsewhere is blocked (a false positive costs one retry). It is a speed bump, not a sandbox; `AGENTS.md` asks for `BLOCKED:` instead of workarounds.
- Visual quality (a smudged wardrobe in a 360° view, a stretched sofa) is not caught by tests. Every milestone ends with a recording on real Comfy Cloud, and those recordings found most of the defects listed in `docs/lecture/README.md`.
