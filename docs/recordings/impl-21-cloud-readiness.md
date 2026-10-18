# impl-21-cloud-readiness

- Started: 2026-10-18T22:29:18.703Z
- Duration: 555 s · Turns: 14 · Cost: $0.74
- Tool calls: Bash 5, Read 3, Edit 5
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-21-cloud-readiness.jsonl`

## Prompt

> spec/M6-backend-and-workflows.md §5 Readiness가 바뀌었어: Cloud에서는 노드 클래스만 보고 모델 파일은 로컬에서만 검사해. 실제 Comfy Cloud 카탈로그를 fixtures/catalogs/comfy-cloud-live.json 으로 고정했고, acceptance/readiness.test.ts 가 `missingFromCatalog(workflow, catalog, backendKind)` 세 번째 인자를 기대하며 빨개. 이걸 구현하고 에디터가 현재 백엔드 종류를 넘기게 해서 pnpm verify 전체가 통과하게 해줘. AGENTS.md 규칙을 따르고 끝나면 짧게 알려줘.

## Agent's final message

구현을 마쳤고 `pnpm verify`가 `VERIFY PASS`로 끝났습니다. AC-72는 테스트 12개가 모두 통과합니다.

- **`missingFromCatalog`** (`packages/comfy/src/index.ts`): 세 번째 인자 `backendKind`를 받습니다. `'cloud'`이면 노드 클래스만 검사하고 모델 파일은 건너뜁니다. 로컬은 지금처럼 모델 파일까지 검사합니다.
- **에디터** (`web/src/editor.ts:790`): `readinessOf`가 이미 쥐고 있던 현재 백엔드 종류(`kind`)를 그대로 넘깁니다.
- **단위 테스트** (`packages/comfy/src/catalog.test.ts`): 기존 호출에 `'local'`을 넣었습니다. Cloud에서는 빠진 노드 클래스만 보고하는지 확인하는 케이스도 하나 추가했습니다.

이 함수를 부르는 곳은 이 세 파일과 acceptance 테스트뿐입니다. 커밋은 하지 않았습니다.

참고로 Python으로 파일을 한꺼번에 고치려던 명령은 guard hook이 막았습니다. 명령에 들어 있던 import 경로 `../../schema/src/index.ts`를 보호 경로 `packages/schema/`로 잘못 본 것으로 보입니다. Edit 도구로 같은 수정을 다시 했습니다. 보호 경로는 건드리지 않았지만, 같은 오탐이 반복되면 hook의 경로 판정을 고쳐야 할 수 있습니다.

## Notes (spec session)

- Found while recording AC-76 against real Comfy Cloud: Cloud's `/api/object_info` omits model files it runs (Pixal3D, Trellis 2, DINOv3), so the stricter rule from impl-20 marked Cloud's product workflow unavailable. Real Cloud catalog pinned as a fixture; Cloud now checks node classes only. No `BLOCKED:`.
- Guard false positive (2 blocks): a compound command that *read* `packages/schema/` and wrote an unprotected file in a Python heredoc. The guard pairs "any write hint" with "any protected path mentioned" — coarse on purpose (a false positive costs a retry; a false negative lets the exam be edited). The agent switched to the Edit tool. Kept as is.
