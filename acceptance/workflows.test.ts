import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { buildProductPrompt, buildRenderPrompt, buildWalkthroughPrompt } from '../packages/comfy/src/index.ts'
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

describe('AC-68 the 360° workflow matches the Comfy Cloud catalog', () => {
  it('AC-68 pano360-from-depth lints against the pinned Cloud catalog and takes the depth panorama through a ControlNet', () => {
    const workflow: ApiWorkflow = JSON.parse(readFileSync('workflows/cloud/pano360-from-depth.json', 'utf8'))

    expect(lintWorkflow(workflow, loadSnapshot('spec/contracts/comfy-cloud-object-info.json'))).toEqual([])
    for (const title of ['roomfit:depth', 'roomfit:positive', 'roomfit:negative', 'roomfit:seed', 'roomfit:save']) {
      expect(byTitle(workflow, title), title).toHaveLength(1)
    }
    const [depthId] = Object.entries(workflow).find(([, node]) => node._meta?.title === 'roomfit:depth')!
    const control = Object.values(workflow).find((node) => node.class_type === 'ControlNetApplyAdvanced')!
    expect(control.inputs.image).toEqual([depthId, 0])
    expect(byTitle(workflow, 'roomfit:save')[0]!.inputs.filename_prefix).toBe('roomfit/pano360')
    expect(byTitle(workflow, 'roomfit:positive')[0]!.inputs.text).toMatch(/^equirectangular 360 image/)
  })

  it('AC-68 the render prompt builder fills the 360° workflow', () => {
    const outcome = buildRenderPrompt(JSON.parse(readFileSync('workflows/cloud/pano360-from-depth.json', 'utf8')), {
      depthImageName: 'roomfit-depth-pano-001.png',
      prompt: 'equirectangular 360 image, bedroom',
      negativePrompt: 'blurry',
      seed: 3
    })
    if (!outcome.ok) throw new Error(`missing ${outcome.missing.join(', ')}`)

    expect(byTitle(outcome.prompt, 'roomfit:depth')[0]!.inputs.image).toBe('roomfit-depth-pano-001.png')
    expect(lintWorkflow(outcome.prompt, loadSnapshot('spec/contracts/comfy-cloud-object-info.json'))).toEqual([])
  })
})

describe('AC-142 the walkthrough workflow matches the Comfy Cloud catalog', () => {
  const file = 'workflows/cloud/walkthrough-ltx23-ic-lora.json'

  it('AC-142 walkthrough-ltx23-ic-lora lints against the pinned Cloud catalog and tags each input once', () => {
    const workflow: ApiWorkflow = JSON.parse(readFileSync(file, 'utf8'))

    expect(lintWorkflow(workflow, loadSnapshot('spec/contracts/comfy-cloud-object-info.json'))).toEqual([])
    for (const title of ['roomfit:first-frame', 'roomfit:control-video', 'roomfit:positive', 'roomfit:seed', 'roomfit:save']) {
      expect(byTitle(workflow, title), title).toHaveLength(1)
    }
    expect(byTitle(workflow, 'roomfit:first-frame')[0]!.class_type).toBe('LoadImage')
    expect(byTitle(workflow, 'roomfit:control-video')[0]!.class_type).toBe('LoadVideo')
    expect(byTitle(workflow, 'roomfit:save')[0]!.class_type).toBe('SaveVideo')
    expect(byTitle(workflow, 'roomfit:save')[0]!.inputs.filename_prefix).toBe('roomfit/walkthrough')
    expect(Object.values(workflow).some((node) => node.class_type === 'TextGenerateLTX2Prompt'), 'no prompt-enhance branch that could carry the template prompt').toBe(false)
    expect(JSON.stringify(workflow)).not.toMatch(/jungle|stone arch/i)
  })

  it('AC-142 the walkthrough prompt builder fills the first frame, the depth video, the prompt and the seed', () => {
    const outcome = buildWalkthroughPrompt(JSON.parse(readFileSync(file, 'utf8')), {
      firstFrameName: 'upload-3.png',
      videoName: 'upload-4.webm',
      prompt: 'A slow, steady camera walkthrough of the living room',
      seed: 9
    })
    if (!outcome.ok) throw new Error(`missing ${outcome.missing.join(', ')}`)

    expect(byTitle(outcome.prompt, 'roomfit:first-frame')[0]!.inputs.image).toBe('upload-3.png')
    expect(byTitle(outcome.prompt, 'roomfit:control-video')[0]!.inputs.file).toBe('upload-4.webm')
    expect(byTitle(outcome.prompt, 'roomfit:positive')[0]!.inputs.text).toBe('A slow, steady camera walkthrough of the living room')
    expect(byTitle(outcome.prompt, 'roomfit:seed')[0]!.inputs.seed).toBe(9)
    expect(lintWorkflow(outcome.prompt, loadSnapshot('spec/contracts/comfy-cloud-object-info.json'))).toEqual([])
  })
})
