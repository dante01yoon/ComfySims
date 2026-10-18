# impl-12-parity

- Started: 2026-10-18T14:12:58.663Z
- Duration: 365 s · Turns: 39 · Cost: $1.59
- Tool calls: Bash 20, Read 4, Edit 13, Write 1
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-12-parity.jsonl`

## Prompt

> spec/M2-home-studio.md 의 빨간 AC들(AC-43, AC-44)을 초록으로 만들어줘. Python 노드팩의 회전 정렬·auto 모드(TS와 같은 알고리즘)와, 스튜디오의 방 포커스 각도와 "Render this view" 버튼이야. 스펙의 "Node pack parity and studio follow-ups" 절을 봐. AGENTS.md 규칙을 따르고, 끝나면 짧게 알려줘.

## Agent's final message

BLOCKED: AC-43과 AC-44는 둘 다 PASS가 됐지만, `pnpm verify`는 여전히 `VERIFY FAIL`입니다. 남은 실패는 보호된 하네스 테스트 하나이고, 사람이 고쳐야 합니다.

**남은 실패:** `harness/self-test/lint-workflow.test.ts:27`이 아직 `/"stretch" is not one of exact, uniform/`를 기대합니다. 그런데 스펙 커밋 149b9fe가 `spec/contracts/comfyui-object-info.json`의 mode 옵션을 `auto, exact, uniform`으로 바꿨습니다. 그래서 정규식을 `/"stretch" is not one of auto, exact, uniform/`로 바꿔야 합니다. 이 테스트는 제 변경 전 첫 verify 실행에서도 이미 실패하고 있었습니다.

**변경 내용**
- **Python 정렬·auto (AC-43, AC-18·AC-19도 PASS):**
  - `nodes/roomfit/fit.py`에 TS `fitGlbBytes`와 같은 알고리즘을 옮겼습니다: 0–90°를 0.5° 간격으로 탐색하고, 긴 변이 더 긴 등록 치수 축에 오도록 90°를 더 돌리며, 동점이면 0°를 유지합니다.
  - `auto` 모드, `align="none"` 옵션, 리포트의 `requested`·`yawDegrees`를 추가했습니다.
  - 노멀도 같은 각도로 같이 회전합니다.
  - 노드의 mode 옵션을 `auto, exact, uniform`으로 바꿨습니다.
- **스튜디오 (AC-44):**
  - 방에 포커스하면 카메라 고도가 60°입니다. 집 전체 뷰는 47° 그대로입니다.
  - 프리셋 옆에 "Render this view" 버튼을 넣었습니다. 프롬프트는 "Photograph of the <방 이름> of a bright modern home, <프리셋> light, …" 형식입니다.
  - 작업이 진행 중일 때 버튼을 막으려고 `isFinished`를 `editor.ts`로 옮겨 `App.tsx`와 같이 씁니다.

포커스한 방이 없을 때는 프롬프트가 "Photograph of a bright modern home, …"이 됩니다. 이 경우는 스펙에 없어서 제가 정했습니다. 커밋은 하지 않았습니다.

## Reviewer notes

- Ended with BLOCKED: correctly — the spec session changed the node contract's mode options and regenerated the catalog snapshot, which broke a harness self-test (expected 'exact, uniform'); the spec session never ran verify before launching. Fixed, and run-session.mjs now refuses to start when the harness self-tests fail.
- Agent rotated normals with the yaw too, and chose a sensible prompt for the no-focused-room case and said the spec did not cover it.
