# impl-02-placement

- Started: 2026-10-18T04:31:52.152Z
- Duration: 100 s · Turns: 17 · Cost: $0.86
- Tool calls: Bash 7, Read 5, Edit 3, Write 1
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-02-placement.jsonl`

## Prompt

> spec/M1-scaled-furniture.md 의 빨간 AC들(AC-3~7, AC-11~13)을 모두 초록으로 만들어줘. 스펙이 바뀐 부분(fitGlb 반환 타입)과 새 placement 패키지가 있어. AGENTS.md 규칙을 따르고, 끝나면 무엇을 했는지 짧게 알려줘.

## Agent's final message

`pnpm verify` now prints `VERIFY PASS`. AC-3 through AC-7 and AC-11 through AC-13 all moved to PASS, and the typecheck and contract-drift checks pass too.

**What I changed**
- **`packages/fit/src/index.ts`**: `fitGlb` now returns a result instead of throwing, matching the new spec type (`{ ok: true, report }` or `{ ok: false, reason }`). The three failure reasons are:
  - `unreadable`: the file is missing or can't be parsed.
  - `no-scene`: the GLB has no scene.
  - `degenerate-bounds`: the bounding box is zero size.

  A failed fit writes no output file. I also removed the comment inside the function, as AGENTS.md requires for any function you touch.
- **`packages/placement/src/index.ts`** (new): four pure functions, `collisions`, `outOfBounds`, `snapPosition` and `snapRotation`.
  - Collisions are checked on the exact rotated rectangles, not their bounding boxes. Items that only touch (within 0.001 cm) don't count as colliding.
  - Out of bounds is reported when a footprint corner leaves the room or when height plus the item's `y` goes above the ceiling.
  - Snapping uses 5 cm and 15° steps, never returns `-0`, and keeps rotation in [0, 360).

**Worth knowing**
- **Room origin:** I assumed the room is centered on the origin on the floor. The spec doesn't say so; the tests imply it (a 200 cm sofa at x = 110 sits flush with the wall of a 420 cm room). If that's wrong, it belongs in the spec.
- **Untested reason:** no fixture covers `no-scene`, so that case isn't checked by a test.
- **Not committed:** nothing is committed yet.

## Reviewer notes

- Verified independently: VERIFY PASS; collision is exact SAT on rotated rectangles; rotation matches three.js rotation.y.
- Agent surfaced two spec gaps: room origin not stated (tests imply floor-center origin) and no fixture for no-scene. Both go to the next spec step.
- Agent removed the impl-01 comment as the new AGENTS.md rule asks; only one-line JSDoc on exports remains.
