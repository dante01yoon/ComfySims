# impl-28-workflow-choice

- Started: 2026-10-19T17:21:20.854Z
- Duration: 919 s · Turns: 56 · Cost: $2.89
- Tool calls: Bash 26, Read 3, Edit 25, Write 1
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-28-workflow-choice.jsonl`

## Prompt

> spec/M10-workflow-and-model-choice.md (Approved) 의 빨간 AC들(AC-56, AC-95~AC-99, 타입 검사 포함)을 초록으로 만들어줘. 작업 종류별 워크플로 선택(내장: sets.json의 그 종류 파일들, 사용자 워크플로: 태그 검사 후 레이아웃에 저장), 선택한 워크플로의 모델 슬롯(백엔드 /api/object_info의 옵션), 다음 작업에 적용, 레일의 "Workflows" 섹션, MCP list_workflows/set_workflow야. 스키마와 계약은 이미 있어. 화면은 `pnpm see`로 확인할 수 있어. AGENTS.md 규칙을 따르고 끝나면 짧게 알려줘.

## Agent's final message

BLOCKED: AC-95와 AC-96을 통과시킬 수 없습니다. 테스트와 fake가 서로 모순이라 사람이 고쳐야 합니다.

구현은 끝났습니다. 다만 `pnpm verify`는 아직 **VERIFY FAIL**입니다.
- **통과:** 타입 검사, AC-56, AC-94, AC-99.
- **실패:** AC-95~98. AC-97과 AC-98은 `workflow-choice.spec.ts`만 따로 돌리면 통과하는데, 전체 verify 안에서는 아래 1번 때문에 실패합니다. `pnpm see`로 화면은 확인하지 않았고, 커밋도 하지 않았습니다.

**고칠 것 1 — `acceptance/e2e/workflow-choice.spec.ts`의 `beforeEach`**
- `backend.spec.ts`의 AC-72가 끝나면서 dev server의 Local URL을 `http://127.0.0.1:8190`으로 바꿔 둡니다.
- 그래서 전체 e2e에서는 `setBackend({ kind: 'local' })`가 연결되지 않는 주소로 붙습니다. 이 때문에 AC-95~98이 모두 실패합니다.
- 수정: `setBackend({ kind: 'local', url: LOCAL })`로 URL을 명시하세요.

**고칠 것 2 — AC-95/96과 `harness/tools/fake-comfy.mjs`의 모순**
- `cloud/product-to-glb-pixal3d.json`은 `LoadMoGeModel`과 `MoGeInference`를 씁니다.
- Local fake는 `LOCAL_WITHOUT`으로 이 두 노드를 뺍니다. 그래서 Local에서는 Pixal3D가 unavailable이 됩니다(AC-95 32행 실패, AC-96의 product 작업은 거부).
- 그런데 AC-95는 같은 카탈로그에서 `local/photo-to-3d-moge.json`이 `LoadMoGeModel` 때문에 unavailable이기를 요구합니다. 하나의 카탈로그로 두 조건을 동시에 만족할 수 없습니다.
- 스펙 의도("Local fake: both product workflows available")를 살리는 방법:
  - `LOCAL_WITHOUT`을 `['MoGePointMapToMesh']`로 줄입니다.
  - AC-95를 `toContain('MoGePointMapToMesh')`로 바꿉니다.
  - `backend.spec.ts` 89행의 `/LoadMoGeModel/`도 `/MoGePointMapToMesh/`로 바꿉니다.

**구현한 것**
- `web/src/workflows.ts` (새 파일): 작업 종류별 선택지를 계산합니다.
  - 내장 워크플로는 `sets.json`에서 그 종류에 해당하는 파일들이고, 사용자 워크플로는 `custom:<name>`으로 붙습니다.
  - 필수 태그를 검사하고, 모델 슬롯을 만들고, 모델 선택을 그래프에 적용합니다.
  - 가용성은 선택한 워크플로 기준의 M6 readiness로 판단합니다.
- `web/src/editor.ts`:
  - 백엔드 카탈로그를 state에 보관하고, 레이아웃이 바뀌면 `backend.unavailable`을 다시 계산합니다.
  - 다음 작업은 선택한 워크플로와 모델로 실행됩니다.
  - `workflowChoice`, `setWorkflow`, `setModel`, `addCustomWorkflow`를 추가했습니다. 선택은 레이아웃에 저장되고 undo가 됩니다.
- `web/src/workspace.tsx`: 레일에 접힌 "Workflows" 섹션을 추가했습니다. 종류별 워크플로 select, 모델 select, "Add workflow"가 들어 있습니다.
- `mcp/server.ts`: `list_workflows`, `set_workflow`를 추가했습니다.
- `packages/comfy`: `inputOptions`를 export해서 readiness 계산과 같은 로직을 공유합니다.

남은 위험 하나: `set_workflow`에 models를 함께 넘기면 undo 항목이 모델마다 하나씩 따로 쌓입니다(라벨은 모두 `mcp:set_workflow`).

## Notes (spec session)

- **Ninth `BLOCKED:`, ninth time the spec session.** Two mistakes in what I wrote: (1) the new test switched to Local without a URL, and AC-72 leaves the dev server's Local URL on an unreachable address, so in the full run every new e2e failed (they passed alone); (2) I expected Pixal3D to be available on the Local fake, but `product-to-glb-pixal3d` also uses `LoadMoGeModel`/`MoGeInference`, which that fake removed — two ACs demanded opposite things of one catalog. The agent found both, proposed exact fixes, and touched nothing protected. Applied as proposed (the fake now drops only `MoGePointMapToMesh`; AC-72 restores the Local URL after itself). VERIFY PASS, no implementation change.
- Lesson: tests that change shared server state must restore it; and "which nodes does this workflow use" is worth one grep before writing an expectation about a fake.
