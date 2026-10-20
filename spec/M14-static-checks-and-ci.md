# M14 — Static checks and CI: lint, dead code, import layers, repo invariants, on every push

| | |
| --- | --- |
| Status | Approved (2026-10-19) |
| Date | 2026-10-19 |
| Owner | Dante |
| Decisions | [ADR-0012](../docs/adr/0012-static-checks-modelled-on-comfyui-frontend.md) |

## 1. Why

**Only `pnpm verify` on Dante's Mac checks the work.** Nothing runs on GitHub, so a contributor's pull request (CONTRIBUTING.md invites them) is checked by nobody until Dante pulls it. Verify itself covers types, tests, builds and e2e, but no linter, no dead-code check and no rule about which part may import which. Dante (2026-10-19): "oxlint랑 CI 만들어주고 테스트 세팅하고 ComfyUI 참고하고 해서 필요한 정적 체크 만들어줘".

**ComfyUI_frontend already settled what to check.** Its gates: oxlint (correctness category plus import, typescript, vitest rules), knip (unused files, exports, dependencies), dependency-cruiser (`deps:audit`, no cycles), JSON/YAML validation, GitHub Actions pinned to commit SHAs, an ADR format check, ruff for Python, Vitest with coverage. ComfySims takes the ones that fit a small TypeScript + React + Python repo.

Baseline on 2026-10-19 with the new configs: oxlint 94 findings (76 type-import style, 5 React effect rules, 13 others), knip 3 unused exports/types + 1 unused dependency (`n8ao`), dependency-cruiser 0, ruff 0.

## 2. Goals and non-goals

Goals
- `pnpm lint` (oxlint), `pnpm knip`, `pnpm deps:check` (dependency-cruiser), `pnpm check:static` (repo invariants), `pnpm lint:python` (ruff) — all clean on main.
- One GitHub Actions workflow that runs them, the typecheck, contract drift, unit tests with coverage, the e2e suite and ruff on every push and pull request.
- `pnpm verify` runs the same static gates, so the Stop hook catches them locally first.

Non-goals (M14)
- A formatter (oxfmt/Prettier): the code has a consistent hand style; reformatting every file would bury history. Revisit separately.
- Type-aware lint rules (oxlint-tsgolint): later, once the plain rules are clean.
- The Python acceptance tests in CI (they need a ComfyUI checkout and venv); ruff only.
- Coverage thresholds: coverage is reported, not gated, until there is a baseline.

## 3. Scenarios

1. **Contributor PR.** Someone opens a pull request that imports `web/src/editor.ts` from `mcp/`. CI fails at "deps" with the rule name `mcp-not-editor-internals` and the import.
2. **Leaked key.** A commit adds `.env.local` or a string that looks like a Comfy API key. `check:static` fails naming the file, never printing the value.
3. **Spec slip.** A new spec reuses `AC-104`. `check:static` fails naming both specs.

## 4. Screens and states

None (command line and the GitHub checks list).

## 5. Behaviour rules

- **oxlint** (`.oxlintrc.json`): plugins eslint, import, oxc, typescript, unicorn, vitest, react; category correctness = error; plus the ComfyUI_frontend rules that apply (no-var, prefer-const, eqeqeq smart, import/no-duplicates, import/no-cycle, top-level `import type`, typescript/consistent-type-imports, no-explicit-any, ban-ts-comment, no-unused-vars with `_` prefix, vitest no-focused/no-disabled tests, react rules-of-hooks/exhaustive-deps). `no-redeclare` is off because a zod schema and its inferred type share a name on purpose; `vitest/valid-expect` allows the message argument. `pnpm lint` runs with `--deny-warnings`.
- **knip** (`knip.json`): package entry points are `packages/*/src/index.ts`; editor, MCP server, harness, demo scripts and acceptance tests are entries. No unused files, dependencies, exports or exported types.
- **dependency-cruiser** (`.dependency-cruiser.cjs`): no cycles, no unresolvable imports, and layers:
  - `packages/` imports nothing from web, mcp, harness, acceptance or demo;
  - `web/src/` (browser) imports nothing from mcp, harness, acceptance or demo;
  - `mcp/` imports nothing from `web/src`, harness, acceptance or demo (the dev-server helpers in `web/*.ts` are shared);
  - product code (web, mcp, packages, harness) imports nothing from acceptance or demo.
- **check:static** (`harness/tools/static-checks.ts`), each check returns problems as `{ check, file, message }`:
  - `json`: every tracked `*.json` parses.
  - `secrets`: no tracked `.env`/`.env.*` file; no tracked text file contains a Comfy API key-shaped string (`comfyui-` followed by 20+ key characters). Messages name the file and line, never the value.
  - `action-pins`: every `uses:` in `.github/workflows/*.y*ml` is a local action (`./…`) or pinned to a 40-hex commit SHA.
  - `spec-ids`: every AC id appears in exactly one spec's acceptance table; statuses are active, planned or manual.
  - `adrs`: files in `docs/adr/` are `NNNN-slug.md`, numbers unique, first line `# ADR-NNNN: …` matching the file number, a `Date: YYYY-MM-DD` line and a `## Status` section.
  - `suppressions`: no tracked source file contains `oxlint-disable`, `eslint-disable`, `@ts-ignore` or `@ts-nocheck` (as in ComfyUI_frontend: fix the code, do not silence the check).
  - Exits 1 with one line per problem.
- **ruff**: `uvx ruff check nodes harness` with ruff pinned.
- **CI** (`.github/workflows/ci.yaml`): on push to main and on pull requests; `permissions: contents: read`; concurrency cancels superseded runs; every action pinned to a SHA. Jobs:
  - `static`: lint, knip, deps:check, check:static, typecheck, contract drift.
  - `unit`: `pnpm test:coverage`, uploads the coverage report.
  - `e2e`: installs Chromium, `pnpm e2e` (fake ComfyUI only, no secrets), uploads the report on failure.
  - `python`: ruff.
- **Verify** adds gates: lint, knip, deps, static checks, and ruff when `uvx` is available.
- `pnpm test:coverage` runs Vitest with v8 coverage over `packages`, `web/src`, `mcp`, `harness/tools` into `.harness/coverage`.

## 6. Contract and data changes

None. `package.json` gains scripts `lint`, `lint:fix`, `knip`, `deps:check`, `check:static`, `lint:python`, `test:coverage`, `check`; dev dependencies oxlint, knip, dependency-cruiser, @vitest/coverage-v8, yaml; `n8ao` is removed (unused; `@react-three/postprocessing` ships its own N8AO).

## 7. ComfyUI workflows

No changes.

## 8. Acceptance criteria

| AC | Status | Criterion |
| --- | --- | --- |
| AC-110 | active | `pnpm lint` passes on the repo, and the oxlint config rejects a planted inline `type` import, a focused test and an explicit `any` |
| AC-111 | active | `pnpm knip` and `pnpm deps:check` pass on the repo, and dependency-cruiser rejects a planted `packages/` → `web/src` import |
| AC-112 | active | `check:static` passes on the repo, and each of its checks (json, secrets, action-pins, spec-ids, adrs, suppressions) reports a planted violation without printing secret values |
| AC-113 | active | `.github/workflows/ci.yaml` has the static, unit, e2e, e2e-gpu and python jobs with read-only permissions and SHA-pinned actions, and every `pnpm` script it runs exists |
| AC-114 | active | `pnpm verify` runs the lint, knip, deps and static gates |
| AC-115 | manual | The CI workflow runs green on GitHub for main (evidence 2026-10-19: https://github.com/dante01yoon/ComfySims/actions/runs/39340481962) |

## 9. Test plan

| AC | Level |
| --- | --- |
| AC-110 ~ AC-112 | vitest: run the tools on the repo; plant violations in temporary files (in a temp dir with the repo config, or a probe file that the test removes) |
| AC-113 | vitest: parse the workflow YAML |
| AC-114 | vitest: read `harness/verify.mjs` gate labels |
| AC-115 | manual: GitHub Actions run |

## 10. Risks and open questions

- The e2e job renders WebGL with SwiftShader on a CI runner; slower than local. If it flakes, retries stay off and the failure trace is uploaded.
- React effect rules (`set-state-in-effect`, `immutability`) flag reset-on-prop-change effects; the implementation session fixes them without changing behaviour (key-based reset or derived state).

## Change log

- 2026-10-20 **`e2e-gpu` job added (macOS arm64 runner, Chromium on Metal) for the camera-motion tests.** On the Ubuntu runner the software renderer drew the studio at ~3 fps, so even the first frame of a 0.8 s glide took longer than the glide. A smooth-motion property cannot be observed there by construction. The Ubuntu `e2e` job excludes `motion.spec` (`E2E_EXCLUDE`); everything else still runs on SwiftShader. Public repositories get macOS runners free.

- 2026-10-19 Written and approved in one step: Dante asked for exactly this ("oxlint랑 CI 만들어주고 … 필요한 정적 체크 만들어줘"), and every open choice above follows ComfyUI_frontend's settled practice.
