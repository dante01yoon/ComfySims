# impl-18-pano360

- Started: 2026-10-18T20:23:30.631Z
- Duration: 1533 s · Turns: 60 · Cost: $3.96
- Tool calls: Bash 31, Read 11, Edit 12, Write 4
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-18-pano360.jsonl`

## Prompt

> spec/M5-room-360.md (Approved) 의 빨간 AC들(AC-63~AC-67, 타입 검사 포함)을 초록으로 만들어줘. 에디터의 깊이 파노라마(서 있는 점 → 등장방형 2048×1024, 인코딩과 축은 스펙 §5), 스튜디오의 "360° view" 버튼과 pano360 작업 카드, 360° 뷰어 다이얼로그, 오래된 뷰 표시와 Regenerate, MCP `view_360` 도구야. 워크플로는 workflows/cloud/pano360-from-depth.json(기존 render 프롬프트 빌더와 같은 태그), 결정 배경은 docs/adr/0010. 화면은 `pnpm see`로 확인할 수 있어. AGENTS.md 규칙을 따르고 끝나면 짧게 알려줘.

## Agent's final message

BLOCKED: one AC-63 test can't pass with the 8-bit encoding the spec sets. A human needs to change `acceptance/e2e/pano360.spec.ts`. Everything else is green: AC-64, 65, 66, 67, 68 and the type check pass. Only that one test keeps `pnpm verify` at FAIL.

**Why the test fails.** In the test "AC-63 an empty room…", `nearestYawAround` takes the first column with the highest brightness. The spec's encoding (grey = 1 − (d − 40)/560) only changes about 0.07 grey levels between 0° and 2° off the nearest wall, at 2.2 cm per level. So every wall shows a flat run of value 156 about 40 columns wide (±3.5°), and its first column is 3.43° off. I read the actual pixels: the run is perfectly symmetric and centred on 0°, 90°, −90° and 180°. The implementation lines up; the way the test reads the peak can't resolve it.

**Fix for a spec session.** Either:
- take the centre of the highest-brightness run (the average yaw of the columns at the maximum) instead of its first column, or
- measure at the edge between wall and floor or ceiling instead.

The other AC-63 test (standing point off furniture, unknown room) passes. With the demo furniture the standing point moves to (−450, −220).

**What I built:**
- **Depth panorama:** six 1024 px cube faces of distance from the eye, resampled into a 2048×1024 equirectangular image using the axes and encoding from §5. The ceiling is added as a plane over the house; openings come out black (far). In the depth image of the demo bedroom, the bed wraps across the left/right seam, the wardrobe is straight ahead, and the windows and doors are where the layout has them.
- **Studio:** a "360° view" button that is disabled with "Focus a room first" when no room is focused, and otherwise shows the expected time in its tooltip. It starts a `pano360` job card, allowing one per room at a time, with Open and Regenerate. The card shows "Layout changed since this view" when items in that room change.
- **Viewer:** a full-window "360° view" dialog with the panorama on a sphere. Drag turns, the wheel zooms within 40–100°, and Close or Esc closes it. It opens by itself when the job finishes and also shows the stale label.
- **MCP:** a `view_360` tool that returns the image and the saved path.

Adding the button wrapped the studio's bottom bar onto two lines, which covered the room chips and broke AC-40 and AC-44. I fixed it with one CSS rule that keeps the labels on one line.

Not checked: no real Comfy Cloud run (AC-69 is still manual). Saving panoramas in the layout file is left as the spec's follow-up. AC-48 and AC-62 failed in the very first verify run, before I changed anything, and passed in the later runs, so they look flaky.

## Notes (spec session)

- **Sixth `BLOCKED:`, sixth time the spec session's fault.** My AC-63 test took the *first* brightest column. With the spec's 8-bit encoding (2.2 cm per grey level) the nearest-wall direction is a flat run ~40 columns wide, so the first column sat 3.4° off. The agent read the pixels, showed the run was centred on 0°/±90°/180°, and proposed two fixes. Applied the first (circular mean of the run). VERIFY PASS after that, no implementation change.
- The agent also fixed a regression it caused (the new button wrapped the studio bar over the room chips, breaking AC-40/44) and noted AC-48/AC-62 failing once before any change (flaky, passed after).
