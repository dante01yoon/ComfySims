# impl-04-nodepack

- Started: 2026-10-18T04:54:23.372Z
- Duration: 260 s · Turns: 29 · Cost: $1.48
- Tool calls: Bash 13, Read 7, Write 8
- Stop hook sent the agent back: 0 · Guard blocks: 0
- Raw transcript (local only): `.recordings/impl-04-nodepack.jsonl`

## Prompt

> spec/M1-scaled-furniture.md 의 빨간 AC들(AC-8, AC-18, AC-19, AC-20)을 초록으로 만들어줘. 노드팩(nodes/roomfit), 워크플로 두 개(workflows/), 프롬프트 빌더(packages/comfy)가 필요해. 결정은 docs/adr/0005 를 봐. AGENTS.md 규칙을 따르고, 끝나면 무엇을 했는지 짧게 알려줘.

## Agent's final message

AC-8, AC-18, AC-19, AC-20 모두 초록으로 바뀌었습니다. `pnpm verify` 결과는 `VERIFY PASS`이고, 게이트 7개(Python 테스트와 실제 ComfyUI 기동 포함)를 전부 통과했습니다. 나머지 AC도 다 PASS이고, AC-10은 수동 확인 항목이라 MANUAL로 남아 있습니다.

**만든 것**
- **`packages/comfy/src/index.ts`**: `buildProductPrompt`와 `buildRenderPrompt`를 만들었습니다. 원본 워크플로를 복제한 뒤 `_meta.title` 태그로 노드를 찾아 입력을 채우고, 없는 태그는 스펙이 정한 순서대로 `missing`에 담아 돌려줍니다. 원본은 바꾸지 않습니다.
- **`nodes/roomfit/fit.py`**: `fit_mesh`는 배치의 각 항목에서 앞의 `vertex_counts[i]`개 정점만 크기를 맞추고, 기준점을 바닥 중앙으로 옮깁니다. 축마다 배율이 다르면 normals를 버리고, 납작한 메시는 `degenerate-bounds`와 해당 index를 돌려줍니다. 입력 메시는 수정하지 않습니다.
- **`nodes/roomfit/__init__.py`**: `RoomfitFitMesh`를 `roomfit-nodes.json`과 똑같이 등록했습니다. 맞추기에 실패하면 `ValueError`를 냅니다. `/roomfit/{path}` 라우트로 빌드된 에디터를 서빙하고, 에디터 폴더 밖 경로는 404로 막습니다.
- **`workflows/product-to-glb.json`**: Hunyuan3D 2로 메시를 만들고 `RoomfitFitMesh`로 크기를 맞춘 뒤 `SaveGLB`로 저장합니다.
- **`workflows/render-from-depth.json`**: SDXL에 depth ControlNet을 거는 렌더 워크플로입니다.
- 두 워크플로 모두 입력 노드에 필요한 태그를 하나씩 달았습니다.

**알아둘 점**
- 테스트의 float32 정점에서는 측정한 크기가 42.500001cm처럼 미세하게 어긋나, 정확히 비교하는 리포트 값(scale 2.0)이 나오지 않았습니다. 그래서 Python 쪽에서는 측정 크기를 소수점 4자리(1µm)에서 반올림합니다. TypeScript `fitGlb`에는 이 반올림이 없어서, 아주 작은 오차 수준에서는 두 결과가 다를 수 있습니다. ADR에 남길 결정이라면 다음 스펙 세션에서 기록해 주세요. 지금은 커밋 메시지에 적는 정도로 충분합니다.
- 워크플로의 모델 파일 이름(`hunyuan3d-dit-v2.safetensors`, `sd_xl_base_1.0.safetensors`, `controlnet-depth-sdxl-1.0.safetensors`)과 steps, cfg 값은 lint가 검사하지 않는 임시값입니다. AC-10 데모에서 실제 값으로 고정해야 합니다.

커밋은 하지 않았습니다. 실제 모델로 워크플로를 돌려 보는 확인(AC-10)도 하지 않았습니다.

## Reviewer notes

- Verified independently: VERIFY PASS with all 7 gates, including the real local ComfyUI boot (AC-19); 20 active ACs pass.
- Agent found a float32 parity gap: Python rounds measured size to 1 µm so exact reports come out as 2.0; TypeScript does not round. Recorded as an open spec question.
- Model file names, steps and cfg in workflows are placeholders until the AC-10 demo pins them.
