# impl-25-exterior

- Started: 2026-10-19T04:12:29.016Z
- Duration: 840 s · Turns: 47 · Cost: $1.94
- Tool calls: Bash 25, Read 5, Edit 12, Write 4
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-25-exterior.jsonl`

## Prompt

> spec/M9-blueprint-to-house.md §5의 외관 샷 규칙이 AC-89 실제 실행 결과로 바뀌었어(§7 "Found in the AC-89 agent run" 참고). 빨간 AC-87과 타입 검사를 초록으로 만들어줘: 항공 뷰는 집이 화면의 50–80%를 차지하게, 거리 뷰는 현관문 벽의 대각선 쪽 대지 모서리에서 두 면이 보이게, 깊이 범위는 가장 먼 대지 모서리까지(그 너머는 검정), 외관 깊이 패스에서 나무 제외(프롬프트에 trees 포함), ExteriorShot에 fovDeg/aspect/depthRange/trees. demo/capture-exterior-depth.mjs로 실제로 보내는 깊이 PNG를 꺼내 볼 수 있어(가짜 ComfyUI로). AGENTS.md 규칙을 따르고 끝나면 짧게 알려줘.

## Agent's final message

AC-87과 타입 검사가 이제 통과하고, `pnpm verify`도 `VERIFY PASS`로 끝났어요. 커밋은 아직 안 했어요.

**바뀐 점**
- **항공 뷰:** 남동쪽에서 45°로 내려다보고, 지붕까지 포함한 집이 화면의 약 65%를 차지하는 거리에 카메라를 둬요. 데모 하우스에서는 카메라가 집 중심에서 약 26 m 떨어져요.
- **거리 뷰:** 현관문 앞쪽에서 집의 x·z 범위를 둘 다 벗어난 대지 모서리 중 현관에 가장 가까운 곳에 서요. 거기서 50 cm 안쪽, 눈높이 160 cm예요. 데모 하우스에서는 (−1150, 950)이에요.
- **깊이 범위:** 가까운 끝은 집의 가장 가까운 모서리, 먼 끝은 가장 먼 대지 모서리예요. 그보다 먼 하늘과 대지 밖 땅은 검정이에요.
- **나무:** 외관 깊이 패스에서는 그리지 않아요. 프롬프트에는 원래대로 "trees"가 들어가요.
- **`ExteriorShot`:** `fovDeg`(50), `aspect`(1024/576), `depthRange`, `trees: false`를 함께 돌려줘요.

**실제로 보내는 깊이 PNG 확인 (가짜 ComfyUI)**
- **항공:** 집이 화면 가운데를 채우고, 지붕 판이 보이고, 대지 너머는 검정이에요.
- **거리:** 두 면이 보이고 현관문도 보여요. 하늘은 검정이에요.

**확인하지 않은 것**
- `demo/capture-exterior-depth.mjs`를 그대로 쓰려면 개발 서버와 가짜 ComfyUI를 백그라운드로 띄워야 하는데, 승인이 필요해서 못 띄웠어요. 대신 같은 동작을 하는 임시 Playwright 스크립트로 PNG를 뽑았고, 확인 뒤 삭제했어요.
- Comfy Cloud에서 실제 렌더는 돌리지 않았어요.

**알아둘 점**
- 거리 뷰에서 집보다 가까운 앞마당 땅은 깊이 값이 범위를 넘어 전부 흰색으로 나와요. 스펙대로 가까운 끝을 집의 가장 가까운 지점으로 잡았기 때문이에요.

## Notes (spec session)

- Fix for the AC-89 finding (exterior renders unreadable). No `BLOCKED:`. The agent checked the depth PNGs it now sends (house fills the aerial frame, sky black, two façades in the street view) with a throwaway Playwright script, since starting background servers needed an approval it could not get headless.
- Known trade-off it reported: in the street view the lawn nearer than the house clips to white (near = nearest house point).
