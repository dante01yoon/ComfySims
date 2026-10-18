# impl-11-house-first

- Started: 2026-10-18T14:01:12.200Z
- Duration: 572 s · Turns: 62 · Cost: $2.38
- Tool calls: Bash 17, Read 14, Edit 27, Write 1, ToolSearch 1, TaskStop 1
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-11-house-first.jsonl`

## Prompt

> spec/M2-home-studio.md 의 빨간 AC들(AC-39~AC-42)을 초록으로 만들어줘. 집을 중심으로 쓰는 기능이야: findSpot(벽에 붙여 방을 향하게 자동 배치), 방 포커스와 스튜디오의 방 칩, 포커스한 방으로 들어가는 상품 생성, 스튜디오에서 렌더. 스펙의 "House-first editing" 절과 계약(packages/schema/src/domain.ts, spec/contracts/editor-api.ts)을 봐. AGENTS.md 규칙을 따르고, 끝나기 전에 스튜디오에서 방 하나를 포커스한 스크린샷을 직접 보고, 무엇을 했는지 짧게 알려줘.

## Agent's final message

AC-39~42가 모두 PASS로 바뀌었고, `pnpm verify`가 `VERIFY PASS`를 출력합니다(나머지 AC도 그대로 통과). 스펙, 테스트, 픽스처는 건드리지 않았습니다.

**한 일**
- **findSpot** (`packages/placement/src/index.ts`): 존 경계와 겹치는 벽 구간 중 문과 창문을 뺀 부분을 후보로 씁니다. 긴 구간부터, 각 구간의 가운데에서 바깥으로 5 cm씩 옮기며 시도합니다. 가구 뒷면은 벽 안쪽 면에서 0.1 cm 띄워 붙이고 앞면(+Z)은 방 쪽을 향합니다. 기존 `outOfBounds`와 `collisions`로 검사해 처음 통과한 자리를 고르고, 실패하면 `no-space` 또는 `unknown-zone`을 돌려줍니다. 박스 방은 네 벽을 쓰고, 방이 하나뿐이라 zoneId는 무시합니다.
- **방 포커스** (`web/src/editor.ts`, `framing.ts`): `focusZone(id | null)`을 추가했습니다. 카메라 중심을 그 방의 중심으로, 거리를 방 크기에 맞추고 같은 3/4 각도로 봅니다. `null`이면 집 전체로 돌아갑니다. 스튜디오로 전환할 때도 포커스한 방을 유지하고, 레이아웃을 새로 불러오면 포커스가 풀립니다.
- **방 칩** (`web/src/studio.tsx`): 프리셋 바 위에 방 이름 칩을 놓았고, 선택한 칩은 `aria-pressed`로 눌린 상태가 됩니다. 눌린 칩을 다시 누르면 집 전체로 돌아갑니다.
- **상품 생성**: 놓을 방은 `zoneId`, 없으면 포커스한 방입니다. 그 방에 자리가 있으면 `findSpot`이 정한 위치에 놓습니다. 생성 전에 자리를 먼저 확인해 공간이 없으면 Comfy 작업을 시작하지 않고 `no-space`를 돌려주고, 생성 후 실제로 놓기 전에 한 번 더 확인합니다. 둘 다 레이아웃은 바뀌지 않습니다.
- **스튜디오 렌더**: 렌더 결과 오버레이가 스튜디오에서 숨겨지는 사이드 패널 안에 있어서 보이지 않았습니다. 패널 밖으로 옮겼고, 렌더할 때 카메라는 그대로입니다.

**스크린샷 확인**: 데모 하우스를 스튜디오에서 열고 "Bedroom" 칩을 누른 화면을 직접 봤습니다. 월넛 바닥의 침실과 침대, 옷장이 화면 가운데에 오고 Bedroom 칩이 눌려 있습니다. 다만 화면이 꽤 빡빡하게 잡혀서 남쪽 벽이 방을 일부 가립니다.

확인하지 않은 것과 남은 위험:
- 스튜디오에는 렌더 버튼이 없어서, 스튜디오에서 렌더하려면 API로 호출해야 합니다.
- `findSpot`은 붙이는 벽의 문만 피하고, 옆 벽에 있는 문이 여는 공간은 검사하지 않습니다.

## Reviewer notes

- Verified independently: VERIFY PASS; AC-39~42 pass.
- First implementation session after the contract gate (AC-38) with a contract change in scope that did NOT end BLOCKED.
- Agent checks for space before starting a Comfy job (no wasted GPU on no-space) and again before placing.
- Agent reported gaps: no Render button in the studio (API only), tight room framing hides part of the room behind the south wall, findSpot ignores door swing space on side walls.
