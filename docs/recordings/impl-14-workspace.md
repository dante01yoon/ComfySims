# impl-14-workspace

- Started: 2026-10-18T17:40:27.674Z
- Duration: 2164 s · Turns: 116 · Cost: $6.55
- Tool calls: Bash 54, Read 9, Edit 40, Write 11, ToolSearch 1
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-14-workspace.jsonl`

## Prompt

> spec/M3-house-workspace.md (Approved) 의 빨간 AC들을 초록으로 만들어줘: AC-23·24·44(작업 모델 변경으로 테스트가 바뀜), AC-47~AC-52(작업 패널·동시 실행·예상 시간·방 라벨·이름 변경·에셋 라이브러리). AC-53(3D 사진)은 다음 세션이니 하지 마. 계약은 packages/schema/src/domain.ts 와 spec/contracts/editor-api.ts, 결정은 ADR-0008. AGENTS.md 규칙을 따르고, 끝나기 전에 스튜디오에서 작업 패널과 라벨이 보이는 스크린샷을 직접 확인하고 짧게 알려줘.

## Agent's final message

BLOCKED: `pnpm verify` still prints VERIFY FAIL, and it can't pass in an implementation session for two reasons a human needs to fix:

1. **AC-53's tests already exist and fail.** The spec lists AC-53 as `planned`, but `harness/verify.mjs` treats a failing test as FAIL even for planned ACs. You asked me not to build AC-53, so its two tests fail. Fix: mark the two AC-53 tests in `acceptance/e2e/workspace.spec.ts` as `test.fixme` until the next session, or have verify count failing planned tests as TODO.
2. **The slow tests are flaky.** The 3 s "slow" window in `harness/tools/fake-comfy.mjs` is too short in the test browser. Right after switching to the studio there's one frame of 2–3 s (the browser recompiles all materials), and it eats the margin. It's not caused by this change: I checked with the rail and labels turned off. So "AC-48 render while a product generates" and "AC-47 running card shows `~60 s`" pass or fail depending on timing. In the last verify, AC-48 passed and AC-47 failed on `~60 s` because the job had already finished. Run alone with 5 repeats, the AC-48 test failed 4 times. Fix: lengthen the window (e.g. 3000 → 8000 ms), or have the test wait for `window.roomfit.scene()` before starting.

Apart from those, everything passes: AC-23, 24, 44 and AC-48~52 are PASS, and AC-47 passes 2 of its 3 tests. Typecheck, build and the Python tests are green.

**What I built:**
- **Jobs:** each Comfy call creates one job with timed steps, a result and a Retry. Up to 3 run at once; a 4th waits as `queued`, and no button is disabled while jobs run. Expected time uses the median of earlier finished jobs (`expectedSeconds` in `packages/comfy`). Room item counts use point-in-polygon (`itemsInZone` in `packages/placement`).
- **Room actions:** `placeAsset` uses `findSpot`, selects the new item and is one undo step. `renameZone` trims and rejects empty names, with one undo step.
- **UI (`web/src/workspace.tsx`):** a right-hand Workspace rail with job cards and the library, plus a room-name label at each room's centre (click focuses, double-click renames). Library thumbnails are rendered locally in `web/src/thumbnails.ts`.

**Screenshots I checked in the studio:**
- Room labels such as "Living · 4 items" sit on each room.
- The panel shows "Jobs (2 running)": running cards read `generating 1 s / ~4 s` with a progress bar, the failed card shows "out of memory" and Retry, and done cards show a thumbnail and Show.
- Focusing a room dims the other labels and presses that room's chip.
- The "Place in" menu lists the focused room first.

**Skipped or limited:**
- **AC-53 stub:** "View as 3D photo" and photo upload only create a failed job ("3D photos are not available yet"), and the viewer calls do nothing. AGENTS.md bans code comments, so this stub is unmarked in the code.
- **Thumbnails:** the demo house's assets have no loadable models, so the library shows box icons. A real GLB thumbnail was never displayed.
- **Done stopping short:** I made no commit and wrote no recording doc. `spec/M4-agent-mcp.md` appeared untracked during the session; it isn't mine and I left it alone.

## Reviewer notes

- Ended with BLOCKED: — two spec-session faults: (1) AC-53 was parked as planned but verify counted its failing tests as FAIL; verify now reports failing tests of planned ACs as TODO* (spec/README updated); (2) the fake's 3 s slow window was shorter than the studio's first-frame shader compile (2–3 s), making AC-47/48 flaky; window now 8 s and tests wait two frames after entering the studio. After the fixes: VERIFY PASS twice in a row.
- Longest session so far (36 min, 116 turns), much of it spent proving the flakiness was not caused by its change (it re-ran with the rail and labels disabled).
