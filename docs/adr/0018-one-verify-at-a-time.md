# ADR-0018: One `pnpm verify` runs at a time, and the Stop hook waits for it

Date: 2026-10-23

## Status

Accepted (2026-10-23, spec session)

## Context

The Stop hook ran `pnpm verify` with a 180 s timeout. A full verify takes about 11 minutes, 10 of them e2e (680 s and 637 s in two runs on 2026-10-23). Claude Code cancels a hook that reaches its timeout and discards its output, so the hook's verify never decided a Stop. Killing the hook does not kill its child: after a SIGTERM to the hook, `node harness/verify.mjs` and `playwright test` kept running.

That orphan, or any second verify started by hand, overlaps the next one. Two verifies share more than their reports. They share the e2e ports 5179, 8199, 8197, 8196 and 8195 (hard-coded in the e2e specs, the demos and `mcp/server.ts`), `web/dist`, `nodes/roomfit/editor`, `.harness/comfy-base`, and `.harness/{vitest,e2e,python}.json`. Each verify deletes `.harness/e2e.json` when it starts. Repro: start verify A, and start verify B the moment A's `e2e.json` appears. A passed all 12 gates and still failed with 84 `NO TEST` ACs, because B deleted the report before A read it.

## Decision

- **A verify holds loopback port 8194 for its whole run** (`harness/tools/verify-lock.mjs`). A second verify prints the holder's PID and waits until the port is free, then runs in full. Both report real results.
- **The lock is a listening socket, not a lock file.** The OS frees the port when the holder dies, including on SIGKILL, so there is no stale lock to detect and no steal race.
- **The Stop hook timeout is 1800 s.** That covers one verify waiting for another (about 2 × 11 minutes) with margin.

## Rejected

- Per-run report files. They fix the deleted `e2e.json`, but two e2e runs still collide on the ports and two builds on `web/dist`. Those are one shared resource each, so the runs must take turns anyway, and the lock already keeps the reports apart.
- Per-run ports. Every e2e spec and demo would need its URLs threaded through, for a parallelism the single-worker e2e does not use.
- A lock file holding a PID. A killed holder leaves it behind, and two waiters that both see a dead PID can each remove the other's fresh lock.
- Killing verify's process tree when the hook is cancelled. With a timeout above the verify time the hook is not cancelled, and an orphan that remains only makes the next verify wait.

## Consequences

- A second verify takes up to twice as long, because it waits for the first. It says so on its first line.
- Port 8194 must stay free for anything else.
- A Stop with a dirty tree can take about 11 minutes. That is the cost of the gate actually deciding the Stop.
