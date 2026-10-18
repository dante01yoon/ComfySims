# impl-16-photo-fov

- Started: 2026-10-18T18:56:05.358Z
- Duration: 527 s · Turns: 29 · Cost: $1.14
- Tool calls: Bash 15, Read 3, Edit 6, Write 2, ToolSearch 1, mcp__chrome-devtools__new_page 1
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-16-photo-fov.jsonl`

## Prompt

> spec/M3-house-workspace.md 의 빨간 AC-62를 초록으로 만들어줘. 실제 Cloud 녹화에서 3D 사진이 검은 화면 가운데 작은 카드처럼 보였어(시야각 60° 고정). 스펙의 "Found by recording on real Comfy Cloud (AC-62)" 절을 봐. 끝나기 전에 뷰어 스크린샷을 직접 확인하고 짧게 알려줘.

## Agent's final message

AC-62가 초록이 됐습니다. `pnpm verify`가 `VERIFY PASS`로 끝났고 AC-62는 `PASS`(1 pass)입니다. 다만 **뷰어 스크린샷은 제가 직접 확인하지 못했습니다.** 스크린샷을 찍는 방법이 셋 다 권한 승인이 필요했는데, 승인되지 않았습니다(scratch Playwright 실행, 서버 수동 기동, chrome-devtools).

**수정한 것** (`web/src/photo-viewer.tsx`, `web/index.html`)
- 고정 60° 시야각을 없앴습니다. 메시의 모든 꼭짓점에서 가장 큰 `|x/z|`, `|y/z|`를 구해 사진의 반각으로 씁니다. 매 프레임 뷰어 비율에 맞춰 `fov = 2·atan(min(tanY, tanX/aspect))`로 정하므로, 사진이 원본을 잘라낸 것처럼 화면을 꽉 채웁니다(cover).
- 카메라는 원점에서 −Z 방향을 봅니다. 예전에는 메시 바운딩박스 중심 쪽을 봤습니다. 회전 제한(±20° / ±10°)과 휠 dolly는 그대로입니다.
- 배경색을 `#0b0c0e`로 바꿨습니다.

화면이 채워졌다는 근거는 AC-62 테스트뿐입니다. 이 테스트는 캔버스 스크린샷에서 밝은 픽셀이 90% 이상인지 봅니다. 눈으로 보려면 아래 명령을 승인해 주세요. 1280×720과 700×1000 두 크기로 뷰어를 찍어 scratchpad의 `shot/`에 저장하는 스크립트가 준비돼 있습니다.
```
npx playwright test -c /private/tmp/claude-501/-Users-dante-Desktop-github-roomfit/cf4b6689-6d8a-4dee-9279-80e5b4326f30/scratchpad/shot/shot.config.ts
```

확인 못 한 것: 실제 MoGe 메시. 테스트 픽스처는 평면 하나라서, 멀리 튀는 꼭짓점이 있으면 시야각이 넓어져 가장자리가 비어 보일 수 있습니다.

## Reviewer notes

- Verified independently: VERIFY PASS; AC-62 passes.
- Agent could not look at its own screenshot: the runner's allowed commands (pnpm, node, ls, cat, grep, git status/diff/log, ComfyUI python) do not include npx/tsx scripts, and its permission prompts went unanswered in headless mode. Harness gap in the See role → next: a pnpm see command.
- Agent warned that far outlier vertices could widen the field of view; checked in the real-Cloud recording.
