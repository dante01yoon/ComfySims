# PROMPTS

OpenRig · Herdr · Tailscale · RustDesk 강의에서 에이전트 팀에게 보낸 프롬프트 원문입니다. 그대로 복사해 쓰세요.

## OpenRig가 저장소에 쓴 파일 — 빌더에게 첫 일 맡기기

```bash
rig send dev-build@starter "pnpm lint가 오류 35개로 실패해. OpenRig가 만든 .openrig와 .claude/plugins 폴더 때문이야. 두 폴더를 린트 검사에서 빼고 .gitignore에도 넣어 줘. 끝나면 pnpm lint로 확인해 줘."
```

> 영상 속 메시지는 오류 수를 35개로 적었지만 실제 화면은 40개였어요. 숫자는 여러분 화면에 맞게 고쳐 쓰세요.

## 자리를 비우고 다른 기기에서 팀 굴리기 — 평면도 PNG 버튼 맡기기

```bash
rig send dev-build@starter@studio "편집기에 Plan PNG 버튼을 만들어 줘. 누르면 지금 집을 위에서 본 평면도를 방 이름과 방 크기(cm)를 넣어 PNG로 내려받게 해 줘. spec과 acceptance 폴더는 건드리지 마. 다 만들고 검사가 통과하면 예시 PNG를 /private/tmp/plan-demo.png에 저장하고, rig queue create로 tier human-gate 일감을 만들어서 나에게 알려 줘."
```
