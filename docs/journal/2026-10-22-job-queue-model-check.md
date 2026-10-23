# 2026-10-22 — Model-checking the job queue

| # | Question | Decision | Basis |
|---|---|---|---|
| 1 | What should check the job queue (`runJob`, `takeSlot`, `releaseSlot`, `retryJob`)? | Model-check two rules with a TLA+/TLC model: the slot limit, and no double run of a job and its retries | ADR-0016 |
| 2 | Where does the model cut steps? | Wherever the code has an `await`; a stretch of code with no `await` between is one action | ADR-0016 |
| 3 | How do we know a pass means something? | Four mutants, each of which must fail | `harness/formal/job-queue/check.mjs` |
| 4 | What did it find? | F1: two Retry clicks on one failed render card start the same request twice. pano360 and walkthrough are protected by their per-room guards | `.claude/skills/verify-job-queue` |

Left open: how to fix F1 (reject a retry while the same request is unfinished, or let a card's retry work only once). That is for the next spec session.
