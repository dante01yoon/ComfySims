import { describe, expect, it } from 'vitest'

import { lintWorkflow, loadSnapshot } from '../tools/lint-workflow.ts'
import type { ApiWorkflow } from '../tools/lint-workflow.ts'

const snapshot = loadSnapshot()
const valid: ApiWorkflow = {
  '1': { class_type: 'LoadImage', inputs: { image: 'sofa.png' } },
  '2': { class_type: 'SaveImage', inputs: { images: ['1', 0], filename_prefix: 'roomfit' } }
}

describe('harness workflow linter', () => {
  it('accepts a valid workflow', () => {
    expect(lintWorkflow(valid, snapshot)).toEqual([])
  })

  it.for([
    { name: 'an unknown node class', change: (w: ApiWorkflow) => { w['3'] = { class_type: 'NotANode', inputs: {} } }, match: /unknown node class/ },
    { name: 'a missing required input', change: (w: ApiWorkflow) => { delete w['2']!.inputs.filename_prefix }, match: /missing required input "filename_prefix"/ },
    { name: 'a link to a missing node', change: (w: ApiWorkflow) => { w['2']!.inputs.images = ['9', 0] }, match: /missing node "9"/ },
    { name: 'a link to a missing output', change: (w: ApiWorkflow) => { w['2']!.inputs.images = ['1', 5] }, match: /has no output 5/ },
    { name: 'a type mismatch', change: (w: ApiWorkflow) => { w['2']!.inputs.images = ['1', 1] }, match: /expects IMAGE but LoadImage output 1 is MASK/ },
    { name: 'a combo value outside the options', change: (w: ApiWorkflow) => { w['3'] = { class_type: 'RoomfitFitMesh', inputs: { mesh: ['1', 0], width_cm: 1, depth_cm: 1, height_cm: 1, mode: 'stretch' } } }, match: /"stretch" is not one of auto, exact, uniform/ }
  ])('rejects $name', ({ change, match }) => {
    const workflow = structuredClone(valid)
    change(workflow)
    expect(lintWorkflow(workflow, snapshot).join('\n')).toMatch(match)
  })
  describe('ComfyUI V3 nodes (Cloud catalog)', () => {
    const cloud = loadSnapshot('spec/contracts/comfy-cloud-object-info.json')
    const video: ApiWorkflow = {
      '1': { class_type: 'LoadVideo', inputs: { file: 'roomfit-depth.webm' } },
      '2': { class_type: 'GetVideoComponents', inputs: { video: ['1', 0] } },
      '3': { class_type: 'ComfySwitchNode', inputs: { switch: true, on_true: ['2', 0], on_false: ['2', 0] } },
      '4': { class_type: 'PrimitiveInt', inputs: { value: 25 } },
      '5': { class_type: 'ComfyMathExpression', inputs: { expression: 'a', 'values.a': ['4', 0] } },
      '6': { class_type: 'CreateVideo', inputs: { images: ['3', 0], fps: ['5', 0] } },
      '7': { class_type: 'SaveVideo', inputs: { video: ['6', 0], filename_prefix: 'roomfit/walkthrough', format: 'auto', 'format.codec': 'auto', codec: 'auto' } }
    }

    it('accepts dynamic sub-inputs of a declared input and match-type links', () => {
      expect(lintWorkflow(video, cloud)).toEqual([])
    })

    it('rejects a dotted input whose parent is not declared', () => {
      const workflow = structuredClone(video)
      workflow['7']!.inputs['quality.level'] = 3
      expect(lintWorkflow(workflow, cloud).join('\n')).toMatch(/unknown input "quality.level"/)
    })
  })
})
