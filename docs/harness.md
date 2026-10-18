# Harness

The harness is the working environment agents run in. It keeps them away from the definition of done and makes them check their own work before they stop. Same five roles as [codex-harness-kit](https://github.com/dante01yoon/codex-harness-kit), rebuilt with Claude Code hooks.

| Role | Part | What it does |
| --- | --- | --- |
| Tell | `AGENTS.md` (loaded through `CLAUDE.md`) | Spec is the definition of done; spec vs implementation sessions; `BLOCKED:` hand-off |
| Block | PreToolUse hook `harness/hooks/guard.mjs` | Denies edits to `spec/`, `acceptance/`, `fixtures/`, `harness/`, `.claude/`, `package.json`, `vitest.config.ts` unless `ROOMFIT_SPEC_SESSION=1` |
| Check | Stop hook `harness/hooks/stop-verify.mjs` → `pnpm verify` | Contract drift, typecheck, tests, then maps tests to ACs. On failure Claude is sent back with the report |
| Stop | Retry limit in the Stop hook | After 3 failed attempts, or a reply starting with `BLOCKED:`, Claude may stop; the report stays in `.harness/last-verify.json` |
| Measure | `harness/tools/measure-glb.ts` | Turns "is this the right size?" into numbers an agent can read: size, bounds and center in cm |
| See | Playwright e2e on headless Chromium (SwiftShader) | Editor behavior through `window.roomfit`; on failure a screenshot and trace land in `.harness/e2e-output/` for the agent to look at |
| See (on demand) | `pnpm see --layout=… --view=… --focus=… --scene=…` | Starts its own editor on port 5189, takes a screenshot to `.harness/see/`, prints console errors and a state summary. Added after impl-16 could not look at its own screen (the runner allows `pnpm`, not `npx`) |

The harness tests itself: `harness/self-test/` checks the guard's block/allow table and the GLB measurer against fixtures with known sizes.

## Limits

The Bash guard is a speed bump, not a sandbox: it matches protected paths next to write-like commands. A determined workaround is still possible, which is why `AGENTS.md` asks for `BLOCKED:` instead.

## Planned gates

- Python node pack tests (`pytest nodes/`) once `nodes/` exists
- Workflow lint against a pinned `object_info` snapshot (AC-8)
- Editor screenshot and render-pass checks with Playwright (AC-9)
