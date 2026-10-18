import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { buildProductPrompt, buildRenderPrompt } from '../packages/comfy/src/index.ts'
import { lintWorkflow, loadSnapshot } from '../harness/tools/lint-workflow.ts'
import type { ApiWorkflow } from '../harness/tools/lint-workflow.ts'

const WORKFLOWS = {
  'product-to-glb': ['roomfit:product-image', 'roomfit:fit', 'roomfit:seed', 'roomfit:save'],
  'render-from-depth': ['roomfit:depth', 'roomfit:positive', 'roomfit:negative', 'roomfit:seed', 'roomfit:save']
} as const

const load = (name: string): ApiWorkflow => JSON.parse(readFileSync(`workflows/${name}.json`, 'utf8'))
const byTitle = (workflow: ApiWorkflow, title: string) =>
  Object.values(workflow).filter((node) => node._meta?.title === title)

describe('AC-8 workflows match the pinned ComfyUI node catalog', () => {
  it.for(Object.entries(WORKFLOWS))('AC-8 %s lints clean and tags each input node once', ([name, titles]) => {
    expect(existsSync(`workflows/${name}.json`)).toBe(true)
    const workflow = load(name)

    expect(lintWorkflow(workflow, loadSnapshot())).toEqual([])
    for (const title of titles) expect(byTitle(workflow, title)).toHaveLength(1)
  })

  it('AC-8 product-to-glb fits the mesh before saving it', () => {
    const workflow = load('product-to-glb')
    const [fitId] = Object.entries(workflow).find(([, node]) => node._meta?.title === 'roomfit:fit')!
    const save = byTitle(workflow, 'roomfit:save')[0]!

    expect(workflow[fitId]!.class_type).toBe('RoomfitFitMesh')
    expect(save.class_type).toBe('SaveGLB')
    expect(save.inputs.mesh).toEqual([fitId, 0])
  })
})

describe('AC-20 prompt builders', () => {
  it('AC-20 wires a product photo, listed size, fit mode and seed into product-to-glb', () => {
    const template = load('product-to-glb')
    const before = structuredClone(template)

    const outcome = buildProductPrompt(template, {
      imageName: 'sofa-001.png',
      dimensions: { width: 200, depth: 90, height: 85 },
      mode: 'uniform',
      seed: 42
    })
    if (!outcome.ok) throw new Error(`missing ${outcome.missing.join(', ')}`)

    expect(byTitle(outcome.prompt, 'roomfit:product-image')[0]!.inputs.image).toBe('sofa-001.png')
    expect(byTitle(outcome.prompt, 'roomfit:fit')[0]!.inputs).toMatchObject({ width_cm: 200, depth_cm: 90, height_cm: 85, mode: 'uniform' })
    expect(byTitle(outcome.prompt, 'roomfit:seed')[0]!.inputs.seed).toBe(42)
    expect(lintWorkflow(outcome.prompt, loadSnapshot())).toEqual([])
    expect(template).toEqual(before)
  })

  it('AC-20 wires the depth pass, prompts and seed into render-from-depth', () => {
    const template = load('render-from-depth')

    const outcome = buildRenderPrompt(template, {
      depthImageName: 'roomfit-depth-001.png',
      prompt: 'scandinavian living room, warm daylight',
      negativePrompt: 'blurry',
      seed: 7
    })
    if (!outcome.ok) throw new Error(`missing ${outcome.missing.join(', ')}`)

    expect(byTitle(outcome.prompt, 'roomfit:depth')[0]!.inputs.image).toBe('roomfit-depth-001.png')
    expect(byTitle(outcome.prompt, 'roomfit:positive')[0]!.inputs.text).toBe('scandinavian living room, warm daylight')
    expect(byTitle(outcome.prompt, 'roomfit:negative')[0]!.inputs.text).toBe('blurry')
    expect(byTitle(outcome.prompt, 'roomfit:seed')[0]!.inputs.seed).toBe(7)
  })

  it('AC-20 reports every missing tag instead of throwing', () => {
    const outcome = buildRenderPrompt({ '1': { class_type: 'LoadImage', inputs: { image: 'x.png' }, _meta: { title: 'roomfit:depth' } } }, {
      depthImageName: 'd.png',
      prompt: 'p',
      negativePrompt: 'n',
      seed: 1
    })

    expect(outcome).toEqual({ ok: false, missing: ['roomfit:positive', 'roomfit:negative', 'roomfit:seed'] })
  })
})

describe('AC-54 the 3D photo workflow matches the Comfy Cloud catalog', () => {
  it('AC-54 photo-to-3d-moge lints against the pinned Cloud catalog and tags its photo and save nodes', () => {
    const workflow: ApiWorkflow = JSON.parse(readFileSync('workflows/cloud/photo-to-3d-moge.json', 'utf8'))

    expect(lintWorkflow(workflow, loadSnapshot('spec/contracts/comfy-cloud-object-info.json'))).toEqual([])
    expect(byTitle(workflow, 'roomfit:photo').map((node) => node.class_type)).toEqual(['LoadImage'])
    expect(byTitle(workflow, 'roomfit:save').map((node) => node.class_type)).toEqual(['SaveGLB'])
  })
})
