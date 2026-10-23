# ADR-0016: The local job queue is model-checked with TLA+

Date: 2026-10-22

## Status

Accepted (2026-10-22, spec session)

## Context

M3 (ADR-0008) runs up to `MAX_CONCURRENT_JOBS` jobs at once and lets a card retry its job. The queue is `runJob`, `takeSlot`, `releaseSlot` and `retryJob` in `web/src/editor.ts`. Its correctness depends on where the `await`s fall: `releaseSlot` hands its slot to a waiter without decrementing, and the per-room guards in `panoramaOf` / `walkthroughOf` check and add a job with no `await` between. The e2e test for AC-48 runs one interleaving. A change that moves an `await` breaks the rules only in orders a test rarely hits.

## Decision

- **Two rules, model-checked.** (1) At most `MAX_CONCURRENT_JOBS` jobs hold a slot, and `runningJobs` counts them. (2) A job and its retries never hold a slot at once.
- **TLA+ with TLC 1.7.4 (the latest stable release; the v1.8.0 prerelease is rebuilt in place, so it cannot be pinned by sha256).** The question is about event orders, which suits a model checker. TLC needs only Java; `pnpm formal:jobs` downloads the pinned `tla2tools.jar` into `.harness/tools/` and checks its sha256. A run takes about 10 s.
- **One model action per stretch of code without an `await`.** The model, its configs and the mutants live in `harness/formal/job-queue/`. The project skill `.claude/skills/verify-job-queue` maps every action to code and records the commit the mapping was last confirmed at.
- **Every check has a mutant that must fail.** `check.mjs` runs broken variants (off-by-one in `takeSlot`, a decrement on hand-off, a lost hand-off, a missing room guard) and fails if one survives.
- **Known findings are expectations, not passes.** A check that fails on today's code is recorded with its counterexample. `check.mjs` reports when the finding stops reproducing.

## Rejected

- Property tests that call the real `runJob`: it lives in a module with the editor store, Three.js and the Comfy client. Faking all of them would test the fakes more than the ordering.
- Adding the check to `pnpm verify`: it needs Java, which CI and contributors may not have. It stays a separate command that the skill tells agents to run.

## Consequences

- The first run found F1. Retrying a `render`, `product` or `photo3d` job twice (two clicks on a failed card's Retry, or the API/MCP while the job runs) runs the same request twice at once. `pano360` and `walkthrough` are safe. The product code is unchanged; a fix needs a spec decision. Fixed by ADR-0017 (2026-10-23).
- The model covers safety only. A slot leaked by a throw between `takeSlot` and `settled` is not checked.
