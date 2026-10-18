import type { ApiWorkflow } from '../../../harness/tools/lint-workflow.ts'
import type { Dimensions, FitMode } from '../../schema/src/index.ts'

export type PromptOutcome = { ok: true; prompt: ApiWorkflow } | { ok: false; missing: string[] }

type InputsByTag = Record<string, Record<string, unknown>>

function wireTaggedInputs(workflow: ApiWorkflow, inputsByTag: InputsByTag): PromptOutcome {
  const prompt = structuredClone(workflow)
  const missing: string[] = []
  for (const [tag, inputs] of Object.entries(inputsByTag)) {
    const node = Object.values(prompt).find((candidate) => candidate._meta?.title === tag)
    if (node) Object.assign(node.inputs, inputs)
    else missing.push(tag)
  }
  return missing.length > 0 ? { ok: false, missing } : { ok: true, prompt }
}

/** Fills the tagged inputs of a product-to-glb workflow; the template is never mutated. */
export function buildProductPrompt(
  workflow: ApiWorkflow,
  input: { imageName: string; dimensions: Dimensions; mode: FitMode; seed: number }
): PromptOutcome {
  return wireTaggedInputs(workflow, {
    'roomfit:product-image': { image: input.imageName },
    'roomfit:fit': {
      width_cm: input.dimensions.width,
      depth_cm: input.dimensions.depth,
      height_cm: input.dimensions.height,
      mode: input.mode
    },
    'roomfit:seed': { seed: input.seed }
  })
}

/** Fills the tagged inputs of a render-from-depth workflow; the template is never mutated. */
export function buildRenderPrompt(
  workflow: ApiWorkflow,
  input: { depthImageName: string; prompt: string; negativePrompt: string; seed: number }
): PromptOutcome {
  return wireTaggedInputs(workflow, {
    'roomfit:depth': { image: input.depthImageName },
    'roomfit:positive': { text: input.prompt },
    'roomfit:negative': { text: input.negativePrompt },
    'roomfit:seed': { seed: input.seed }
  })
}
