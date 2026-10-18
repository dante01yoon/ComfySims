# impl-15-photo3d

- Started: 2026-10-18T18:26:41.488Z
- Duration: 1112 s · Turns: 53 · Cost: $2.20
- Tool calls: Bash 18, Read 10, Edit 19, Write 3, ToolSearch 1, mcp__comfy-cloud__get_output 1
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-15-photo3d.jsonl`

## Prompt

> spec/M3-house-workspace.md 의 빨간 AC-53(3D 사진)을 초록으로 만들어줘. 렌더 결과나 업로드한 방 사진을 workflows/cloud/photo-to-3d-moge.json 으로 3D 메시로 만들고, 회전이 제한된 전용 뷰어로 보여주는 기능이야. 스펙 1·4·5절과 ADR-0008을 봐. AGENTS.md 규칙을 따르고, 끝나기 전에 뷰어 스크린샷을 직접 확인하고 짧게 알려줘.

## Agent's final message

AC-53이 초록으로 바뀌었고 `pnpm verify`는 **VERIFY PASS**입니다. 다른 AC는 그대로이고, 커밋은 하지 않았습니다.

**만든 것**
- **3D 사진 작업**: 렌더 결과나 업로드 사진을 ComfyUI에 올리고 `photo-to-3d-moge.json`을 실행해 GLB를 받습니다. 작업 카드의 단계는 `uploading → queued → meshing → downloading → done` 순으로 표시됩니다. 끝나면 뷰어가 자동으로 열리는데, 그 사이에 사용자가 다른 화면을 열었으면 열지 않습니다. 재시도는 기존 작업 목록 방식을 그대로 씁니다. 코드는 `web/src/editor.ts`, MoGe 프롬프트 빌더는 `buildRoomPhotoPrompt`(`packages/comfy`)입니다.
- **뷰어**(`web/src/photo-viewer.tsx`): 전체 화면으로 열리고 메시는 텍스처만 보이게 그립니다. 드래그로 좌우 ±20°, 상하 ±10°까지만 돌아가고, 휠로 장면 깊이의 0–40% 안에서 앞뒤로 움직입니다. 로딩 표시, 출처 캡션("Render · House, work" 또는 파일명), Back 버튼이 있습니다. `state().photoViewer`에 현재 각도가 들어갑니다.
- 렌더 오버레이에 "View as 3D photo" 버튼을 추가했습니다.

**스크린샷 확인**: 가짜 ComfyUI로 렌더를 하고 오버레이 버튼으로 뷰어를 열어 직접 봤습니다. Back 버튼, 캡션, 메시가 보였고, 크게 드래그하면 각도가 −20°/+10°에서 멈추고 화면도 실제로 돌아갔습니다.

**확인 못 한 것과 위험**
- 스크린샷의 메시는 가짜 서버의 박스 GLB라서 화면이 박스로 꽉 찹니다. 실제 MoGe 결과를 받아 확인하려 했지만 comfy-cloud `get_output` 권한이 없어 못 했습니다. 카메라는 원점에서 메시 중심을 보도록 했는데, 실제 MoGe 메시의 좌표 방향과 맞는지는 AC-55 실제 Cloud 녹화에서 확인해야 합니다.
- 렌더를 3D 사진으로 만들 때 이미지를 항상 다시 업로드합니다. 스펙은 "가능하면 ComfyUI에 이미 있는 이미지 사용"이라 아직 그 부분은 안 했습니다.

## Reviewer notes

- Verified independently: VERIFY PASS; AC-53 passes.
- Agent could not check the viewer camera against a real MoGe mesh (the fake returns a box GLB; it had no Cloud output access) and flagged it for the real-Cloud recording (AC-55).
- Render → 3D photo re-uploads the render image; the spec's 'reuse when possible' is not done yet.
