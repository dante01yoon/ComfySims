# Contributing to ComfySims

Thanks for helping. ComfySims is built **spec-first**: a feature is a written spec with acceptance criteria (ACs), tests that encode those ACs, and code that makes them pass. Humans and agents follow the same loop, and `pnpm verify` is the judge.

## Set up

```bash
pnpm install
pnpm web:dev          # editor on http://127.0.0.1:5179
pnpm verify           # every gate + the AC table (about 5–8 minutes)
```

- Node 22+, pnpm 10+. Playwright downloads Chromium on first `pnpm e2e`.
- **Comfy Cloud**: put `COMFY_CLOUD_API_KEY=…` in `.env.local` (git-ignored) and start with `ROOMFIT_COMFY_URL=https://cloud.comfy.org pnpm web:dev`. The key is added only by the local dev server, only to Cloud requests; it never reaches the browser. Never commit it or paste it in an issue.
- **Local ComfyUI**: run it on `127.0.0.1:8188` (or set `ROOMFIT_LOCAL_URL`). The backend chip in the editor shows which job kinds it can run and which model files are missing.
- **Python acceptance** runs when a local ComfyUI checkout exists (`ROOMFIT_COMFYUI_DIR`, default `~/Desktop/github/ComfyUI`).
- `pnpm verify` needs ports 5179, 8199, 8197, 8196 and 8195 free; stop your own dev server first.

## How a change gets in

1. **Small fix** (a bug against an existing AC, docs, tooling): open a PR. If a test should have caught it, add or fix the test first.
2. **New feature or behavior change**: start with a spec.
   - Copy `spec/TEMPLATE.md` to `spec/M<n>-<name>.md`, status `Draft`.
   - Fill in: why (with evidence), goals and non-goals, scenarios, screens and every state with exact labels, behaviour rules a test can check, contract changes, ComfyUI workflows, ACs, test plan, risks, and open questions with a recommended answer each.
   - **Check feasibility before writing the spec** — run the workflow once, read the real API response. Record job ids and what you saw in the spec.
   - Open a PR or issue with the draft. The maintainer marks it `Approved` and settles the open questions. Nothing is implemented against a `Draft`.
3. **Spec session**: contracts (`packages/schema`, `spec/contracts/`), fixtures, fakes and acceptance tests, ACs set to `active`. Finish by running `pnpm verify` and checking that **only the new ACs are red** — a red AC you did not expect is a bug in the spec session.
4. **Implementation**: make the red ACs green without touching `spec/`, `packages/schema/`, `acceptance/`, `fixtures/`, `harness/`, `.claude/` or the test configs. If one of those is wrong, stop and say so (agents reply `BLOCKED:` with the file, line and a proposed fix).
5. **Recording**: user-facing milestones end with a `manual` AC — a recording on real Comfy Cloud (`demo/record-*.mjs`) and an evidence note in `docs/recordings/demo-ac*.md`. Recordings find what tests do not (proportions, framing, real API differences); file what they find.

## Working with agents

The repo is set up for Claude Code (`.claude/settings.json`, `AGENTS.md`, `docs/harness.md`):

- An ordinary `claude` session is an implementation session: the guard hook blocks protected paths, and the Stop hook runs `pnpm verify` before it may finish (up to three tries).
- `ROOMFIT_SPEC_SESSION=1 claude` is a spec session: protected paths are writable. A human should be present.
- Recorded headless sessions: `node harness/tools/run-session.mjs <name> <prompt-file>`, then `node harness/tools/write-recording.mjs <name>`. Prompts live in `docs/recordings/prompts/`.
- Do not edit the checkout an agent is working in; your changes become its failing verify.

## Rules for code

- TypeScript strict, no `any`. Centimeters everywhere except inside GLB files (meters). Outcomes as data at boundaries instead of throws.
- No code comments; one-line JSDoc on exported APIs only. Rationale belongs in the commit message, the PR or an ADR (`docs/adr/`).
- Every user-visible label is the one the spec names; e2e tests find controls by role and name.
- ComfyUI workflows are API-format JSON in `workflows/`, with ComfySims's inputs tagged by `_meta.title` (`roomfit:depth`, `roomfit:positive`, …). They must lint against the pinned catalog for their backend (`spec/contracts/*object-info.json`); `workflows/sets.json` maps backend and job kind to a file.
- Tests never call real third-party sites or Comfy Cloud. Use the fakes, the reserved `.example` domains, and fixtures captured from real responses.

## Commits and PRs

- Conventional prefixes: `feat(scope):`, `fix(scope):`, `spec:`, `docs:`, `test:`, `demo:`.
- One concern per PR. Say which ACs it moves (`AC-63~68 PASS`) and paste the end of `pnpm verify`.
- Decisions with alternatives get an ADR (`docs/adr/NNNN-title.md`): context, decision, evidence, alternatives rejected, consequences.

## Media and data

- Product photos in demos belong to their sellers; use them only as examples, keep thumbnails small, and credit the store link. Prefer photos you own or generated ones.
- Do not commit API keys, `.env.local`, `.harness/`, `.recordings/` or `demo/out/` (all git-ignored).

## License

GPL-3.0. By contributing you agree your contribution is licensed under it.
