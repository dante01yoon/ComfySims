# 2026-10-23 — One verify at a time

| # | Question | Decision | Basis |
|---|---|---|---|
| 1 | Why did two overlapping verifies report fake `NO TEST`? | Each verify deletes `.harness/e2e.json` on start; the later one deleted the earlier one's report before it was read | Repro below |
| 2 | Separate the reports, or serialize the runs? | Serialize. The two runs also share the e2e ports, `web/dist`, the node pack build and `comfy-base` | ADR-0018 |
| 3 | What holds the lock? | A listening socket on 127.0.0.1:8194, freed by the OS when the holder dies | `harness/self-test/verify-lock.test.ts` |
| 4 | Why did the Stop hook never finish? | Its 180 s timeout is below a full verify (about 11 minutes); the cancelled hook leaves verify running as an orphan | ADR-0018 |
| 5 | What is the new Stop hook timeout? | 1800 s, enough for one verify that waits for another | ADR-0018 |

Repro before the fix: verify A passed all 12 gates and failed with 84 `NO TEST` ACs, because verify B was started when A's `e2e.json` appeared. After the fix: A and B started 5 s apart; B waited for A and both printed `VERIFY PASS`.
