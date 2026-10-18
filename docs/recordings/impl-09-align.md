# impl-09-align

- Started: 2026-10-18T13:22:04.092Z
- Duration: 367 s · Turns: 31 · Cost: $1.47
- Tool calls: Bash 19, Read 1, Write 1, Edit 9
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-09-align.jsonl`

## Prompt

> spec/M2-home-studio.md 의 빨간 AC들(AC-36, AC-37)을 초록으로 만들어줘. 실제 Comfy Cloud로 만든 가구 13/15개가 사진 각도 때문에 돌아가 있어서 맞춤이 찌그러졌던 문제야(스펙의 "Fitting real generated furniture" 절). packages/fit 과 에디터 패널 기본값을 바꾸면 돼. AGENTS.md 규칙을 따르고, 끝나면 무엇을 했는지 짧게 알려줘.

## Agent's final message

BLOCKED: 에디터 패널 기본값을 `auto`로 바꾸지 못했어요. 막는 건 `spec/contracts/editor-api.ts`이고, 보호된 경로라 제가 고칠 수 없어요. 사람이 아래처럼 바꿔 주면 돼요.
- 38행 `ProductRequest.mode?: 'exact' | 'uniform'`에 `'auto'` 추가
- 72행 `addProductFromPhoto`의 report 타입에 `requested`(요청한 모드) 추가

지금 계약 타입으로는 패널이 `addProductFromPhoto`에 `auto`를 넘길 수 없어요. 계약이 바뀌면 `web/src/App.tsx`에서 기본값을 `'auto'`로 바꾸고 `<option value="auto">`를 추가하면 끝나요.

나머지는 끝났고 `pnpm verify`가 `VERIFY PASS`예요. AC-36(5/5)과 AC-37(3/3)이 PASS로 바뀌었어요.

**`packages/fit/src/index.ts`**
- **회전 정렬 (AC-36):** 맞추기 전에 메시 꼭짓점의 XZ 바닥 면적이 가장 작아지는 각도를 0–90° 범위에서 0.5° 간격으로 찾아요. 긴 변이 목록상 더 긴 축에 놓이지 않으면 90°를 더 돌려요. 동점이면 0°를 유지해요. 회전은 별도 노드 `roomfit-align`에 넣고, 그 위에 기존 스케일·피벗 노드를 씌웠어요.
- **보고 필드:** `fitGlbBytes`는 네 번째 인자로 `{ align: 'auto' | 'none' }`을 받아요. 기본은 `'auto'`예요. 보고서에 `yawDegrees`와 `requested`가 추가됐고, `mode`는 실제로 쓴 모드예요.
- **`auto` 모드 (AC-37):** 정렬 뒤 `exact`로 맞췄을 때 왜곡이 1.15 이하면 `exact`, 넘으면 `uniform`을 써요.

**`web/src/App.tsx`**
- 패널의 모드 상태 타입을 계약의 `ProductRequest['mode']`로 바꿨어요. 스키마의 `FitMode`에 이미 `auto`가 들어 있어서, 작업 전부터 typecheck가 실패하던 걸 이걸로 고쳤어요. 기본값은 여전히 `exact`예요.

확인하지 않은 것과 위험:
- 꼭짓점 수 × 180개 각도로 계산해요. 수십만 개 꼭짓점 메시에서는 브라우저에서 맞추는 데 시간이 걸릴 수 있지만, 실제 생성 메시로는 재보지 않았어요.
- 스펙에 적힌 대로 Python 노드 팩은 아직 회전 정렬을 하지 않아요.

## Reviewer notes

- Ended with BLOCKED: correctly — third time the spec session left the contract behind (ProductRequest.mode lacked 'auto', report lacked requested/yawDegrees). Spec session fixed the contract; the panel default change goes to a follow-up session.
- Agent noted the 180-angle × vertex-count search may be slow on real meshes; checked next on the 15 Cloud models.
