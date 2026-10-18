# impl-05-bridge

- Started: 2026-10-18T12:01:35.762Z
- Duration: 579 s · Turns: 51 · Cost: $3.03
- Tool calls: Bash 25, Read 3, Write 4, Edit 18
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-05-bridge.jsonl`

## Prompt

> spec/M1-scaled-furniture.md 의 빨간 AC들(AC-21~AC-26)을 초록으로 만들어줘. 에디터가 ComfyUI / Comfy Cloud를 직접 부르는 브리지야. 계약은 spec/contracts/editor-api.ts, 결정은 docs/adr/0006 을 봐. AGENTS.md 규칙을 따르고, 끝나면 무엇을 했는지 짧게 알려줘.

## Agent's final message

BLOCKED: `pnpm verify`는 아직 실패해요. AC-21~26 테스트는 전부 통과했지만, 사람이 고쳐야 하는 보호된 테스트 파일에서 typecheck 오류가 남아 있어요.

- **원인:** `acceptance/comfy-client.test.ts` 34, 35행의 `fake.prompts.get(queued.id)!.prompt['122'].inputs`가 `noUncheckedIndexedAccess` 설정 때문에 TS2532 오류를 냅니다. 제 코드와는 무관해요.
- **수정 방법 (스펙 세션에서):** `prompt['122']!.inputs`, `prompt['3']!.inputs`처럼 `!`를 붙이면 됩니다. 아니면 `harness/tools/fake-comfy.d.mts`의 `prompt` 타입을 바꿔도 돼요. 둘 다 보호 경로라 제가 손대지 않았어요.

**구현한 것**
- **AC-22:** `packages/fit`에 `fitGlbBytes`를 추가했어요. 파일 시스템 없이 바이트만으로 맞추고, 기존 `fitGlb`는 이 함수를 감싸서 파일을 읽고 쓰는 래퍼가 됐어요.
- **AC-21:** `packages/comfy`에 `createComfyClient`(업로드, 큐잉, 작업 대기, 다운로드), `buildPhotoTo3dPrompt`, `savedFiles`를 추가했어요.
  - 실패는 예외 대신 결과 데이터로 돌려줍니다.
  - `/api/jobs`가 404이면 `/api/history`로 넘어가서, 예전 버전 로컬 ComfyUI도 지원해요.
  - ComfyUI 응답은 zod로 검증해요.
- **AC-23, 24:**
  - 에디터에 `addProductFromPhoto`와 `renderInComfy`를 붙였고, 작업 상태는 `state().jobs`에 쌓이며 렌더 결과는 `lastRender`에 들어가요.
  - `comfy-output:` 경로의 에셋은 `/api/view`로 받아서 불러올 때마다 다시 맞춥니다. 메쉬 캐시 키는 URI에 크기와 맞춤 모드를 더한 값이에요.
  - 생성 작업이 실패하면 레이아웃은 그대로 둡니다.
- **AC-25:** `web/vite.config.ts`에 `/comfy` 프록시를 넣었어요.
  - API 키는 환경변수나 `.env.local`에서 서버 쪽만 읽어 `X-API-Key` 헤더로 붙여요.
  - 302 리다이렉트는 프록시가 키 없이 직접 따라가요.
- **AC-26:** 사이드 패널에 라벨 붙은 입력칸, "Generate 3D"/"Render" 버튼, `role="status"` 상태 줄, "Render result" 이미지를 추가했어요.
- 워크플로 JSON을 import하려고 `tsconfig.json`에 `resolveJsonModule`을 켰어요.

**알아둘 점**
- 정확 맞춤인데도 왜곡값이 1이 아니라 1.0000000131로 나와서 AC-23이 실패했어요. GLB 정점이 float32라서 생기는 오차라, 에디터가 기록하는 `distortion`만 소수점 4자리로 반올림했어요. `fitReport` 자체는 바꾸지 않았어요.
- 상품을 만들 때 GLB를 한 번 받아 맞춘 뒤, 메쉬를 불러오면서 같은 GLB를 한 번 더 받아요. 코드를 줄이려고 받아들인 중복이에요.
- 실제 Comfy Cloud로는 확인하지 않았어요(AC-27, 수동 녹화 항목). 커밋도 하지 않았어요.

## Reviewer notes

- Ended with BLOCKED: correctly. All AC-21~26 tests passed, but typecheck failed on a protected test the spec session wrote (missing ! under noUncheckedIndexedAccess). The agent named the line and the fix and did not touch it. Spec session fixed the test; VERIFY PASS, 26 automated ACs.
- Reviewed the key path: proxy uses redirect manual and fetches the signed URL without headers; key is read with loadEnv on the server only (no VITE_ prefix).
- Agent rounds stored distortion to 4 decimals because float32 vertices give 1.0000000131 for an exact fit.
