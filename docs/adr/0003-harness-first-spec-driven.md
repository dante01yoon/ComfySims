# ADR-0003: Harness first, spec-driven, multi-agent only where contracts allow

Date: 2026-10-18

## Status

Accepted

## Context

The project is also lecture material on how to work with coding agents. A show of many agents talking teaches little and fails live. What transfers is how agents are made to check their own work.

## Decision

- Lightweight spec-driven development: one spec per milestone, numbered ACs, each AC owned by a test. No separate long-form spec documents.
- Harness before features: contracts, fixtures, measuring tools and `pnpm verify` exist before any implementation agent runs.
- Spec sessions and implementation sessions are separate; the guard enforces it.
- Parallel agents are used only when contracts make the work independent (node pack, editor, workflows, floor plan), each in its own worktree, each judged by the same `pnpm verify`.

## Rejected

- Heavy SDD tooling with multi-page specs per feature: more text to keep in sync than the project has code.
- Agent graph for the demo's sake: parallelism without a contract produces merge conflicts, not speed.
