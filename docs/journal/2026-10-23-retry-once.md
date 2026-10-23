# 2026-10-23 — Fixing F1: a job is retried once

| # | Question | Decision | Basis |
|---|---|---|---|
| 1 | How do we stop two Retry presses on one failed card from running the same request twice (F1)? | A job is retried once, and only after it finished; the card hides the button once used | ADR-0017 |
| 2 | Where is "already retried" kept? | `Job.retried`, set in `retryJob` before its first `await`, so the editor state and the MCP agent both see it | ADR-0017 |
| 3 | What if the retry is rejected before a job starts? | `retried` is cleared again so the button comes back | e2e `AC-154 a Regenerate the room guard rejects…` fails without it |
| 4 | How do we know the model still means something? | `api-retries` config, two retry mutants, and `OneUnfinishedPerRoom` so the room-guard mutant is still killed | `pnpm formal:jobs` |

Repro before the fix: two clicks on the same failed card's Retry made 3 cards (expected 2). Playwright's `dblclick()` did not reproduce it, because the new card shifts the old one before the second click lands. The test clicks the same button element twice instead.

New AC: AC-154 (M3).
