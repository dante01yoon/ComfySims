# impl-13-cutaway

- Started: 2026-10-18T14:25:24.795Z
- Duration: 656 s · Turns: 50 · Cost: $1.84
- Tool calls: Bash 22, Read 8, Edit 15, Write 2, ToolSearch 1, TaskStop 1
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-13-cutaway.jsonl`

## Prompt

> spec/M2-home-studio.md 의 빨간 AC들(AC-45, AC-46)을 초록으로 만들어줘. 실제 Cloud로 집 투어를 녹화해 보니 (1) 방 렌더가 위에서 내려다본 미니어처처럼 나오고 (2) 벽에 붙인 램프가 270cm 벽에 가려 안 보였어. 스펙의 "Found by recording the walkthrough" 절을 봐. AGENTS.md 규칙을 따르고, 끝나기 전에 오피스를 포커스한 스튜디오 스크린샷을 직접 확인하고 짧게 알려줘.

## Agent's final message

AC-45와 AC-46이 둘 다 PASS로 바뀌었고, `pnpm verify`가 `VERIFY PASS`를 출력합니다. 다른 AC도 전부 그대로 통과합니다.

**AC-45, 벽 컷어웨이**
- 방을 포커스하면 벽을 110cm 위로는 그리지 않고, 집 전체 보기에서는 270cm 그대로 둡니다. 문 위·창문 위 벽 조각도 같이 잘립니다.
- 배치 규칙은 여전히 실제 벽 높이로 판단합니다.
- 바뀐 곳: `web/src/App.tsx`, 그리고 높이 값을 정하는 `wallCutCm`(`web/src/editor.ts`).

**AC-46, 눈높이 렌더**
- 방을 포커스한 채 렌더하면 카메라를 150cm 높이에 놓습니다. 위치는 방에서 가장 큰 가구와 가장 먼 모서리에서 40cm 안쪽이고, 방 중앙의 90cm 높이를 바라봅니다.
- 이 카메라로 depth 이미지를 뽑은 뒤 원래 시점으로 되돌립니다. 포커스가 없으면 지금 보는 시점 그대로 렌더합니다.
- 바뀐 곳: `eyeLevelCamera`(`web/src/framing.ts`), `renderInComfy`(`web/src/editor.ts`).

**스펙에 없는 결정 하나:** 눈높이로 찍는 순간에만 벽을 다시 270cm로 올립니다. 110cm로 잘린 채 150cm 높이에서 찍으면 카메라가 벽 너머 옆방과 하늘까지 보게 돼서 실내 사진이 나오지 않기 때문입니다. 그래서 렌더가 도는 동안에는 `state().wallCutCm`이 잠깐 270을 보고합니다. 이 방식이 괜찮은지 스펙 세션에서 정해 주세요.

**오피스 스크린샷:** 스튜디오에서 Office 칩을 누른 화면을 직접 찍어 봤습니다. 벽이 낮게 잘려 있고, 동쪽 벽에 붙은 190cm 책장과 북쪽 벽의 책상·의자가 가려지지 않고 다 보입니다. 데모 집 오피스에는 램프가 없어서, 녹화 때 램프가 놓였던 그 동쪽 벽의 책장으로 확인했습니다.

확인하지 않은 것과 남은 위험:
- 눈높이 depth 이미지를 직접 열어 보지 않았고, 실제 Cloud로 렌더해 보지도 않았습니다. 테스트는 가짜 ComfyUI 서버로만 돌았습니다.
- 방 안에 있는 가구는 방 경계 사각형으로 판단합니다. ㄱ자 같은 다각형 방이면 옆방 가구가 섞일 수 있습니다.
- 커밋은 하지 않았습니다.

## Reviewer notes

- Verified: my first run failed AC-42 intermittently — the restored camera differed by ~1e-13 (float noise) and the spec session's test compared cameras with exact equality. Test now compares to 6 decimals; 3/3 stable. Not an implementation defect.
- Agent raised a spec gap and chose a behaviour for it: walls go back to full height during the eye-level shot so the render shows an interior, not neighbouring rooms and sky. Accepted into the spec.
