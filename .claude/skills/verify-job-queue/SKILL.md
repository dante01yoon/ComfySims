---
name: verify-job-queue
description: Model-check the editor's local job queue (runJob, takeSlot, releaseSlot, retryJob in web/src/editor.ts) with TLA+/TLC. Use when a change touches those functions, the per-room "already being made" guards in panoramaOf / walkthroughOf, MAX_CONCURRENT_JOBS, or the Retry / Regenerate buttons, and before claiming such a change keeps the concurrency rules.
---

# Verify the job queue

## The rules

1. **Slot limit.** No more than `MAX_CONCURRENT_JOBS` (3) jobs run at once. Harm if broken: a fourth Cloud generation starts and the editor's queue no longer means anything (M3 AC-48).
2. **No double run.** A job and its retries never run at the same time. Harm if broken: the same request is generated twice on Cloud (paid time, two cards, the later one overwrites `lastRender` / the opened view).

"Runs" means *holds a slot*: from the moment `takeSlot` grants it (fast path or hand-off from `releaseSlot`) until `releaseSlot` runs after `settled(work)`.

## Run it

```
pnpm formal:jobs              # all checks + mutants, about 10 s
pnpm formal:jobs --traces     # also print the counterexample of the known finding
pnpm formal:jobs --no-mutants # checks only
```

Needs Java 11+ (`java -version`). The script downloads TLC `tla2tools.jar` v1.8.0 once into `.harness/tools/` and checks its sha256. It ends with `FORMAL JOB-QUEUE OK` (exit 0) when every result matches its expectation, `FORMAL JOB-QUEUE MISMATCH` (exit 1) otherwise, `FORMAL ERROR` (exit 2) when the tool cannot run.

Expected output today:

| Line | Meaning |
| --- | --- |
| `PASS slots` | Rule 1 holds, and `runningJobs` always equals the number of slot holders |
| `PASS guarded-retries` | Rule 2 holds for `pano360` and `walkthrough` jobs, and a room never has two unfinished jobs of one of those kinds (`OneUnfinishedPerRoom`) |
| `PASS card-retries` | Rule 2 holds for `render`, `product` and `photo3d` jobs retried from their cards |
| `PASS api-retries` | Rule 2 holds for those jobs retried by `retryJob` from the API or MCP, at any phase |
| 6 × `KILLED mutant …` | Each check still fails on a broken variant, so a pass means something |

## Files

- `harness/formal/job-queue/JobQueue.tla` — the model.
- `harness/formal/job-queue/slots.cfg`, `guarded-retries.cfg`, `card-retries.cfg`, `api-retries.cfg` — one config per check, with its bounds.
- `harness/formal/job-queue/check.mjs` — runs TLC, compares each result with its expectation (`CHECKS`), and runs the mutants (`MUTANTS`).
- Decision records: `docs/adr/0016-model-check-the-job-queue.md`, `docs/adr/0017-a-job-is-retried-once-after-it-finished.md` (the F1 fix).

These paths are spec-session paths (`harness/`, `.claude/`, `package.json`). In an implementation session the guard blocks edits to them: if the model must change, reply `BLOCKED:` with the model change a human should make.

## Coverage and sync

Last confirmed that the model describes the code at commit **`014ed8c`**, the commit that lands ADR-0017 (2026-10-23).

| Code (with ADR-0017) | Model |
| --- | --- |
| `MAX_CONCURRENT_JOBS = 3`, `packages/schema/src/domain.ts:53` | `MaxConcurrentJobs = 3` in every `.cfg` |
| `runningJobs`, `waitingForSlot`, `startedJobs`, `web/src/editor.ts:719-721` | variables of the same names |
| `runJob` up to `await takeSlot(id)`, `web/src/editor.ts:769-784` (no `await` before it, so one step) | `RunJob` |
| `takeSlot` fast path / queue branch, `web/src/editor.ts:746-753` | the `IF runningJobs < MaxConcurrentJobs` in `RunJob`; phase `granted` / `queued` |
| `runJob` resuming after `await takeSlot(id)` and calling `work(run)`, `web/src/editor.ts:785-794` | `Resume` / `TakeSlotResolves`; phase `granted` → `running` |
| `settled(work)` returning, then `releaseSlot()` and `addStep(done/failed)` with no `await` between, `web/src/editor.ts:794-801`, `releaseSlot` at `755-759` | `Finish` / `WorkSettles`: hand the slot to `Head(waitingForSlot)` without decrementing, or decrement |
| Editor API entries that call `runJob`: `addProductFromPhoto:967`, `renderZone:995`, `renderExterior:495`, `photo3d:1045`, `panoramaOf:1109`, `walkthroughOf:1239` | `Start` / `EditorApiCall` |
| `retryJob`, `web/src/editor.ts:1277-1288`: rejects unless the job is finished and not `retried`, then `markRetried` (`1290`) and calls the closure with no `await` between; `retries.set(id, retry)` in `runJob`; the closure re-enters the same entry synchronously | `Retry` / `RetryJobCall` with `RetryAllowed(j)`, same `req`, same `lineage`, sets `retried` on `j` in the same step |
| `retryJob` clearing `retried` after a retry rejected before it made a job | not modeled: it changes no queue state, and while `retried` is set every other retry of that job is rejected |
| The "already being made" guards, `panoramaOf:1113`, `walkthroughOf:1243` (title = kind + room, checked in the same step as the job is added) | `EntryRejects` over `GuardedRequests` |
| Retry from a failed card / Regenerate on a done `pano360` / `walkthrough` card, shown while `!job.retried`, `web/src/workspace.tsx:256,272` | `card-retries.cfg`: `RetryFrom = {"done", "failed"}` |
| `window.roomfit.retryJob` and the MCP server can ask to retry any id | `slots.cfg`, `guarded-retries.cfg`, `api-retries.cfg`: `RetryFrom` = every phase |

A model `req` stands for one request; for guarded kinds it stands for one title (one room), since the guard compares titles. `lineage` is the id of the job the user first asked for; a retry inherits it.

### Does a change touch this?

```
git diff 014ed8c -- web/src/editor.ts web/src/workspace.tsx packages/schema/src/domain.ts | grep -nE 'runJob|takeSlot|releaseSlot|retryJob|retries|retried|markRetried|waitingForSlot|runningJobs|startedJobs|settled|MAX_CONCURRENT_JOBS|already being made|isFinished|api.retryJob'
```

Any hit, a new caller of `runJob`, a new `await` inside `runJob` before `takeSlot` or between `settled` and `releaseSlot`, or a new guard means: re-read the rows above against the new code before trusting the result.

## After a change to the covered code

1. Run `pnpm formal:jobs` before the change and note the output.
2. For each row of the table, check that the code still does what the model says, and that every `await` boundary is still where the model has a step boundary. A step in the model must be code that runs with no `await` in between.
3. If the change is meant to alter behavior, change the model to match the code (spec session), not the other way round. A new `await` between a check and the write it guards becomes two actions in the model.
4. Run `pnpm formal:jobs` again.
5. Move the sync commit above to the new commit, and update the line numbers in the table, only after steps 2–4 confirm that the model describes the code there.

### Reading a result

- `FAIL <cfg>: <Invariant> violated` with `UNEXPECTED`: the code (as modeled) breaks a rule. Print the trace (`--traces` or it prints automatically on a mismatch) and retell it in the code's words: `RunJob`/`EditorApiCall` = an API call, `RetryJobCall` = `retryJob(id)`, `TakeSlotResolves` = runJob resumes after `takeSlot`, `WorkSettles` = `settled(work)` returned and `releaseSlot` ran. Then decide:
  - **Real bug**: every step of the trace is something the code can do (check the row of each step). Report it with the trace. Do not weaken an invariant or a bound to make it pass.
  - **Modeling error**: a step in the trace is something the code cannot do (e.g. the model lets two actions interleave where the code has no `await`). Fix the model, and say what was wrong.
- `known finding … NO LONGER REPRODUCES`: someone fixed a recorded finding. Confirm the fix in the code, then change that check's `expect` in `check.mjs` to `'pass'`, drop its `finding`, and update Findings below.
- `SURVIVED mutant`: a check no longer fails on a broken variant — the model or the invariant has gone weak. Fix that before trusting any pass.
- `STALE mutant`: the model text a mutant edits has changed. Update the mutant's `from`/`to` to break the same thing in the new text.
- `ERROR … TLC did not finish`: a syntax or type error in the model or a cfg; the TLC output is printed.

## Findings

**F1 — Retry can run the same render twice at once.** (`card-retries`, found at `4a80d56`, fixed by ADR-0017: a job is retried once, after it finished. `card-retries` and `api-retries` pass, and the mutants that drop either half of `RetryAllowed` fail.)

1. `renderInComfy` starts job `render-1`; it takes a slot, runs, and fails.
2. The failed card shows **Retry**. The user clicks it: `retryJob('render-1')` calls `renderZone(request, zone)` → `runJob` → job `render-2` takes a slot.
3. `render-1`'s card is still `failed` with its Retry button (a retry makes a new card), so a second click — or a second `window.roomfit.retryJob('render-1')` / MCP call — starts `render-3` with the same request, and it takes a slot too.
4. `render-2` and `render-3` run the same request at the same time.

The same holds for `product` (`addProductFromPhoto`) and `photo3d`, and through the API also while the original job is still running. `pano360` and `walkthrough` are safe because their entries reject while a job with the same title is unfinished, in the same step that adds the job. Since ADR-0017 the room guards are no longer what keeps rule 2 for those kinds; they keep `OneUnfinishedPerRoom`.

## What this does not cover

- **Bounds.** `slots`: 2 requests, up to 6 jobs, every retry source. `guarded-retries`: 2 rooms, up to 6 jobs. `card-retries`: 1 request, up to 3 jobs. `api-retries`: 1 request, up to 4 jobs, every retry source. Larger counts are not checked; the rules involve 3 slots and pairs of jobs, so these bounds reach the queue being full with waiters and hand-offs.
- **Liveness.** It does not check that a queued job eventually runs. A throw in `runJob` between `takeSlot` and `settled` (e.g. in `comfyOn` or building `run`) would leak a slot forever; that is not modeled.
- **Work contents.** `work(run)` is one opaque `running` phase; `oneAtATime` (pass exports), uploads and Cloud-side queueing are out of scope. Cloud may queue further jobs on its side.
- **Rejections before a job exists** (`cannotRun`, missing workflow) are left out: they change no queue state.
- **Two editor tabs** each have their own queue; the limit is per tab.
- **Two separate user requests** for the same render (not a retry) are allowed by the spec and are not counted as a double run.
