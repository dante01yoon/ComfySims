# impl-20-readiness

- Started: 2026-10-18T21:31:01.839Z
- Duration: 422 s · Turns: 11 · Cost: $0.76
- Tool calls: Bash 8, Edit 2
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-20-readiness.jsonl`

## Prompt

> spec/M6-backend-and-workflows.md 의 준비 상태 규칙이 바뀌었어(§5 Readiness: 빈 옵션 목록도 "설치된 모델 없음"으로 본다, 이미지 업로드 입력은 제외). 실제 로컬 ComfyUI의 카탈로그를 fixtures/catalogs/comfyui-no-models.json 으로 고정했고, acceptance/readiness.test.ts (AC-72)가 빨개. 이걸 초록으로 만들고 pnpm verify 전체가 통과하게 해줘. AGENTS.md 규칙을 따르고 끝나면 짧게 알려줘.

## Agent's final message

BLOCKED: I made the code change the spec asks for, but `pnpm verify` still fails. The remaining failures are bugs in protected files (`acceptance/`, `harness/`), which an implementation session isn't allowed to edit.

**What I changed:**
- `packages/comfy/src/index.ts`: in `modelOptions`, I removed the `options.length > 0` check. An empty option list now counts as "not installed", and image-upload inputs are still skipped.
- `packages/comfy/src/catalog.test.ts`: one unit test checked the old rule. I changed it so empty lists in both formats (`[[]]` and `['COMBO', {options: []}]`) now report the file as missing.

**Result:** In `acceptance/readiness.test.ts`, 3 of 4 local cases pass, plus the upload case. `local photo3d` still fails. My unit tests pass.

**What a human needs to change:**
1. **`acceptance/readiness.test.ts`, `emptyOptionList`:** it only recognises the `[[...]]` format. In the fixture, `LoadMoGeModel.model_name` uses the other format, `["COMBO", {"options": []}]`. So `modelFilesOf(photo3d)` finds nothing and the `toBeGreaterThan(0)` check fails. `missingFromCatalog` itself does report `moge_2_vitl_normal_fp16.safetensors`. Fix: have the helper also read `spec[1].options` when `spec[0] === 'COMBO'`.
2. **`harness/tools/fake-comfy.mjs`, `modelFilesUsedByWorkflows` and `catalogOf`:** these mark the workflows' model files as installed in the fake servers, which is why AC-70/71/72 e2e fail.
   - They only pick up inputs whose names end in `_name`. `ModelPatchLoader`'s input is called `name`, so `Z-Image-Turbo-Fun-Controlnet-Union.safetensors` never gets installed. That makes render unavailable on both backends (AC-71 error, AC-70 shows "3 workflows unavailable" instead of 2).
   - They only add files to `spec[0]` arrays, so `COMBO` inputs are never filled.
   - The snapshots store every option list as empty, so other dropdown values like `scheduler` would also count as missing. Fix: install every string value of any option-list input in both formats, skipping upload inputs.

I didn't add an ADR or journal entry because I made no decision. The spec already sets the rule. Once items 1 and 2 are fixed, AC-72 and the e2e tests should pass without more source changes, but I haven't run that to confirm.

## Notes (spec session)

- **Seventh `BLOCKED:`, seventh time the spec session.** Two bugs in what I wrote after finding the readiness hole on a real ComfyUI: the test helper only knew the `[[...]]` option format (the real catalog also uses `["COMBO", {options: []}]`, e.g. `LoadMoGeModel.model_name`), and the fake only "installed" files for inputs named `*_name` (missing `ModelPatchLoader.name`, so render looked unavailable everywhere). The agent made the one-line product fix, then reported both with the exact fix. Applied as described; VERIFY PASS with no further implementation change.
- Lesson: the real catalog fixture caught the product bug; the hand-written fake hid it and then broke when the rule became stricter. The closer the fake is to real data, the fewer spec-session bugs.
