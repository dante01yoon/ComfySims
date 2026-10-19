# impl-29-realism

- Started: 2026-10-19T18:04:05.993Z
- Duration: 1100 s · Turns: 51 · Cost: $1.86
- Tool calls: Bash 32, Edit 15, Read 3
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-29-realism.jsonl`

## Prompt

> spec/M13-renders-like-a-real-home.md (Approved) 의 빨간 AC들(AC-100~AC-102, 타입 검사 포함)을 초록으로 만들어줘. packages/comfy의 scenePrompt(레이아웃 기반 프롬프트: 방 이름, 바닥재, 그 방 가구 이름, 조명 프리셋, 방별 생활 디테일, 하얀 벽 방지 네거티브), 방 렌더와 360° 뷰에 적용, 스튜디오의 "Render style" 선택(Lived-in / As built, 레이아웃에 저장)이야. 스파이크 결과는 스펙 §1. AGENTS.md 규칙을 따르고 끝나면 짧게 알려줘.

## Agent's final message

BLOCKED: AC-101 can't pass as the test is written. The test needs a one-line fix, and that file is protected.

**Cause:** when "Render this view" finishes, the render result overlay opens automatically. It covers the whole studio area, so the next step, clicking "360° view", never lands. This auto-open is existing behaviour, and `house-flow.spec.ts:105` depends on it, so I didn't change the app to work around it.

**Fix for a human:** in `acceptance/e2e/render-style.spec.ts`, add this line just before the 360° view click (line 30):
```ts
await page.getByRole('button', { name: 'Close' }).click()
```

**Where things stand** (from `pnpm verify`):
- **AC-100:** PASS.
- **AC-102:** PASS.
- **AC-64:** PASS.
- **Type check:** passes.
- **AC-101:** FAIL, only for the overlay reason above. The test got past the room render's prompt checks; the timeout is on the 360° click.

**What changed:**
- **`packages/comfy`:** added `scenePrompt` and exported it, built to spec §5. Furniture inside a room is found with `inPolygon` from the placement package.
- **Editor:**
  - Added `renderStyle` to the state and `setRenderStyle`, which saves the choice in the layout and can be undone.
  - Room renders and 360° views now use the layout-based prompt and negative. A prompt passed in by the caller still wins, and the negative follows the style.
- **Studio:** a "Render style" select (Lived-in / As built) sits next to "Render this view".
- **MCP:** `render_room` uses `scenePrompt`. With no room given, it describes the focused room instead of the whole home.

The 360° prompt keeps the old `<Room name>, ` before the new text, because AC-64 checks that the room name appears with its capital letter. So it reads "equirectangular 360 image, Bedroom, Photograph of a lived-in bedroom…". I haven't run anything on real Comfy Cloud, so AC-103 (the manual recording) is still to do.

## Notes (spec session)

- **Tenth `BLOCKED:`, tenth time the spec session.** My AC-101 test clicked "360° view" right after a room render, but the render overlay opens by itself and covers the studio (existing behaviour other tests rely on). The agent declined to change the app to suit the test and proposed the one-line fix (close the overlay). Applied; VERIFY PASS.
- Also mine: I had left three untracked spike scripts in `demo/` while the agent worked, so its Stop hook saw a dirty tree. Moved to `docs/spikes/m13/`.
