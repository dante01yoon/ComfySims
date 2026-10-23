# ADR-0017: A job is retried once, after it finished

Date: 2026-10-23

## Status

Accepted (2026-10-23, spec session)

## Context

The job-queue model check (ADR-0016) found F1. A failed card keeps its Retry button after a retry, because the retry makes a new card. A second press on the same button, or a second `retryJob(id)` from the API or MCP, started the same request again while the first retry still ran. Both held a slot. On Cloud that is paid time and two cards, and the later result overwrites `lastRender` or the opened view. `retryJob` also accepted a job that was still running.

Two fixes were open in the 2026-10-22 journal: reject a retry while an unfinished job carries the same request, or let a job's retry work only once.

## Decision

- **`retryJob(id)` starts a job only when job `id` is finished and has not been retried.** Otherwise it is rejected and changes nothing.
- **The job remembers it.** `Job` gains `retried?: boolean`. `retryJob` sets it in the same synchronous step that starts the new job, before any `await`, so a second call in the same tick already sees it.
- **The card hides Retry / Regenerate once `retried` is set.** The new job's card carries the next retry. One press makes one card.
- **A retry rejected before it starts a job clears `retried` again.** That covers a missing workflow, missing nodes, and a room whose view is already being made. The button comes back and nothing was lost.
- **The model follows the code.** `Retry(j)` in `JobQueue.tla` requires `RetryAllowed(j)` (finished and not retried) and marks `j` in the same action. A new config `api-retries` checks every retry source for render-like jobs. Two new mutants (drop "not retried", drop "finished") must each fail. The room guard keeps its mutant through a new invariant, `OneUnfinishedPerRoom`, because the retry rule alone now prevents double runs of a pano or walkthrough.

## Rejected

- Rejecting a retry while an unfinished job carries the same request. Two separate user requests for the same render are allowed (M3), so "the same request" would need a lineage id passed into `runJob` from inside each entry's retry closure. That is more hidden state for the same guarantee.
- Disabling the button for the duration of the click only. It leaves `retryJob` from the API and MCP open, which the model shows can double run too.

## Consequences

- Retrying the same failed job a second time means pressing Retry on the newest card in its chain. Older cards in the chain stay as history with no Retry.
- `retryJob` of a running job is now rejected. No caller in the repo relied on it.
- A job cleared from the panel can no longer be retried, since `retryJob` looks it up in `jobs`.
