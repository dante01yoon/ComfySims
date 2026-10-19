# impl-27-street-near

- Started: 2026-10-19T04:57:54.676Z
- Duration: 665 s · Turns: 15 · Cost: $0.77
- Tool calls: Bash 9, Read 2, Edit 3
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-27-street-near.jsonl`

## Prompt

> spec/M9-blueprint-to-house.md 의 거리 뷰 깊이 범위 규칙이 바뀌었어: 가까운 끝을 집이 아니라 카메라 앞 1 m 바닥으로(§5, §7 storeys spike 참고). 빨간 AC-87을 초록으로 만들어줘. 항공 뷰는 그대로야. AGENTS.md 규칙을 따르고 끝나면 짧게 알려줘.

## Agent's final message

AC-87 now passes and `pnpm verify` prints `VERIFY PASS`.

- **The change:** in the street view, the near end of the depth range is now the ground 1 m in front of the camera instead of the nearest house point. The far end is still the farthest lot corner. The aerial view still uses the nearest house point.
- **Where:** `exteriorDepthRange` in `web/src/framing.ts` now takes the view. Its one caller, `exteriorShot` in `web/src/editor.ts`, passes it in.

I didn't look at the new street depth image with `pnpm see`, and I didn't run a render on real Comfy Cloud. So I haven't confirmed that the house now comes out as one storey; the next AC-89 run will show that.
