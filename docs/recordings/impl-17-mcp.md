# impl-17-mcp

- Started: 2026-10-18T19:16:59.275Z
- Duration: 1017 s · Turns: 74 · Cost: $3.27
- Tool calls: Bash 26, Read 11, Write 5, Edit 31
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-17-mcp.jsonl`

## Prompt

> spec/M4-agent-mcp.md (Approved) 의 빨간 AC들(AC-56~AC-60)을 초록으로 만들어줘. roomfit MCP 서버(stdio, `pnpm mcp` = mcp/server.ts)와, dev 서버가 여는 로컬 브리지(에디터 탭과 MCP 서버를 잇는 웹소켓), 에디터 쪽 추가 API(screenshot, setActionLabel, undoLabels, agentConnected, imageName)야. 도구 계약은 spec/contracts/mcp-tools.json, 브리지 세부는 스펙의 "Bridge details" 절. @modelcontextprotocol/sdk 와 ws 는 이미 설치돼 있어. 화면은 `pnpm see`로 확인할 수 있어. AGENTS.md 규칙을 따르고 끝나면 짧게 알려줘.

## Agent's final message

AC-56부터 AC-60까지 모두 PASS로 바뀌었고 `pnpm verify`는 `VERIFY PASS`입니다. MCP e2e 6개와 contract 테스트 2개도 통과합니다. 커밋은 하지 않았습니다.

**만든 것**
- **`mcp/server.ts`, `mcp/editor.ts`**: `pnpm mcp`로 뜨는 stdio 서버이고 도구 15개를 zod로 정의했습니다. 방 이름은 대소문자와 상관없이 찾습니다. 첫 도구 호출 때 브리지에 붙고, 끊기면 다음 호출 때 다시 붙습니다. 타임아웃은 상태 도구 10초, 잡 도구 15분입니다. `render_room`은 PNG를 `.harness/renders/<jobId>.png`에 저장합니다. `{ path }` 입력은 서버에서 base64로 바꿔 넘깁니다.
- **`web/bridge.ts`**: dev 서버 플러그인입니다. 시작할 때 토큰을 새로 만들어 `.harness/bridge-token`에 씁니다. 토큰이 틀리면 4401, 다른 Origin이나 루프백이 아닌 주소·Host면 4403으로 닫습니다. 에디터 탭은 가장 최근 것 하나만 씁니다.
- **`web/src/agent.ts`**: 에디터 탭이 브리지에 붙어 `window.roomfit`으로 호출을 실행합니다. 상태를 바꾸는 호출은 `mcp:<tool>` 라벨로 감쌉니다.
- **에디터 쪽 변경**
  - `screenshot`, `setActionLabel`, `state().undoLabels`, `state().agentConnected` 추가
  - 실행 취소 기록에 라벨 추가(사용자 편집은 `editor`)
  - `ProductRequest.imageName`이 있으면 업로드를 건너뜁니다.
  - 작업 공간 사이드바에 "Agent connected" 표시 추가
- **기타**: `studioPrompt`를 `packages/comfy`로 옮겨 서버와 스튜디오가 같이 씁니다. `tsconfig`에 `mcp`를 추가했습니다.

**하지 않은 것**
- 리스크 절에 나온 진행 상황 알림(progress notification)은 넣지 않았습니다.
- ADR-0009는 스펙 세션에서 쓸 일이라 쓰지 않았습니다.
- `add_product`에 `comfyInputName`을 넘긴 잡은 로컬 사진이 없어서 잡 카드에 썸네일이 나오지 않습니다.

**알아둘 점**
- 브라우저는 백그라운드 탭에서 프레임 그리기를 멈춥니다. 그래서 에디터 탭이 백그라운드에 있으면 `screenshot`과 `render_room`이 10초 타임아웃에 걸릴 수 있습니다.
- `pnpm see`도 dev 서버를 띄우기 때문에 `.harness/bridge-token`을 덮어씁니다. 그 뒤 원래 dev 서버에 붙은 MCP 연결은 끊기고, 에디터를 새로고침해야 다시 연결됩니다.

## Reviewer notes

- Verified independently: VERIFY PASS; AC-56~60 pass (real stdio MCP client, real websocket bridge, fake ComfyUI).
- Agent flagged: background tabs throttle rendering so screenshot/render_room can time out; pnpm see overwrites the bridge token (both in ADR-0009 consequences).
- Progress notifications not implemented; jobs started by comfyInputName have no thumbnail.
