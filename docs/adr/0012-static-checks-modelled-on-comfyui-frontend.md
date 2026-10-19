# ADR-0012: Static checks and CI follow ComfyUI_frontend's gates, trimmed to this repo

Date: 2026-10-19

## Status

Accepted

## Context

Until M14 only `pnpm verify` on one Mac checked the work. Contributors were invited (CONTRIBUTING.md) but nothing ran on their pull requests. ComfyUI_frontend, the codebase this project grew next to, has a settled set of gates: oxlint, ESLint for Vue-only rules, oxfmt, knip, dependency-cruiser, stylelint, JSON/YAML validation, action SHA pins, an ADR format check, ruff, Vitest coverage, Playwright.

## Decision

Take the gates that fit a small TypeScript + React + Python repo: oxlint (no ESLint: no Vue, and oxlint covers the React hook rules), knip, dependency-cruiser with explicit layer rules, ruff, Vitest coverage (reported, not gated), and one repo-invariants script (`check:static`: JSON parses, no secrets, pinned actions, unique AC ids, ADR format). One CI workflow runs them plus typecheck, contract drift and e2e. Verify runs the same static gates so the Stop hook fails before a push would.

## Alternatives

- **ESLint + typescript-eslint**: slower, and every rule we need exists in oxlint. Rejected.
- **Biome** (lint + format): would bring a formatter decision with it and diverges from ComfyUI_frontend. Rejected.
- **Formatter now**: reformatting every file buries the recorded history the lecture uses. Deferred.
- **Type-aware lint (oxlint-tsgolint)**: worth it later; first get the plain rules clean.
- **Several CI workflows like ComfyUI_frontend**: that repo needs path filters and sharding; here one workflow with four jobs is easier to read.

## Consequences

- Layer rules make the architecture (docs/architecture.md) enforceable: packages stay pure, the browser editor and the MCP server never import each other.
- A leaked key or a duplicated AC id fails CI instead of being noticed by chance.
- Every new dependency or export has to be used, or knip fails.
