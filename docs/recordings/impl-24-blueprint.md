# impl-24-blueprint

- Started: 2026-10-19T03:22:26.157Z
- Duration: 1667 s · Turns: 76 · Cost: $4.34
- Tool calls: Bash 28, Read 5, Edit 40, Write 2
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-24-blueprint.jsonl`

## Prompt

> spec/M9-blueprint-to-house.md (Approved) 의 빨간 AC들(AC-56, AC-83~AC-87, 타입 검사 포함)을 초록으로 만들어줘. packages/placement의 defaultSite, 에디터의 대지(로트·지면·나무, 기본 대지), 블루프린트 언더레이(배율·원점·불투명도 슬라이더, 저장), setHousePlan(방 밖 가구는 라이브러리로), 외관 샷(평지붕 슬래브, 항공·거리 카메라, 외관 깊이 패스의 나무는 매끈한 수관), "Render exterior" 버튼과 두 렌더 작업, MCP set_house_plan/set_site/set_blueprint/render_exterior야. 스파이크 결과는 스펙 §7, 스키마와 계약은 이미 있어. 화면은 `pnpm see`로 확인할 수 있어. AGENTS.md 규칙을 따르고 끝나면 짧게 알려줘.

## Agent's final message

The M9 ACs you listed are all green: AC-56 and AC-83 to AC-88 pass, the type check passes, and `pnpm verify` prints `VERIFY PASS`. I haven't committed anything.

**What I built**
- **`defaultSite`** (`packages/placement`): the lot is the house bounds plus 5 m on each side, with grass. A path runs from the front door to the lot edge. Trees are placed at fixed spots 2.5 m out from the house, skipping any that would sit near the path.
- **Studio**: it now draws the lot, ground, path and trees from the site, or from the default site when there is none. The lot shows up in the scene as `site-lot` and each tree as `site-tree-<i>`. I replaced the old door-path and tree layout with this.
- **Blueprint underlay**: the editor sidebar has a new "Blueprint" section with Upload, an Opacity slider (default 50), scale and origin fields, Hide and Remove. The image is drawn just above the floor in plan view, is not drawn in the studio, and is saved with the layout.
- **`setHousePlan`**: an invalid plan is rejected with its issues and nothing changes. Items whose centre is outside every new room are removed from the house but stay in the library, and are listed in `movedToLibrary`.
- **Exterior shots**: during the shot there is a flat roof slab with its top at wall height + 20 cm. The aerial camera looks down at 45° from the south-east. The street camera is at 160 cm in front of the front door. In the exterior depth pass, trees become smooth spheres on trunks.
- **"Render exterior"**: queues two render jobs, Aerial and Street. Both prompts start with "Exterior architectural photograph…".
- **MCP**: added `set_house_plan`, `set_site`, `set_blueprint` and `render_exterior`.

**Checked with `pnpm see`**
- The studio shows the default lot, the path and the trees.
- In the editor view the blueprint lines up under the plan (the room names and door swings show through), and the sidebar section is there.

**Not done or not checked**
- `houseRotationDeg` and `northDeg` are stored and validated but not used yet: they don't rotate the house or change the sun direction.
- Exterior renders were only tested against the fake ComfyUI. Whether they look good on real Comfy Cloud is for the AC-89 recording.
- If a new plan doesn't fit inside the current custom lot, `setHousePlan` rejects it. You have to change the site first.

## Notes (spec session)

- No `BLOCKED:`, no guard blocks, Stop hook never sent it back. The spec session's own lesson this time: the first red-list check showed every e2e AC failing because one e2e file imported a function that did not exist yet (`defaultSite`), so Playwright could not compile the suite. Fixed before the implementation session — e2e tests now assert values instead of importing unimplemented code.
- Not done (reported): `houseRotationDeg` and `northDeg` are stored but not applied; exterior renders only checked against the fake until AC-89.
