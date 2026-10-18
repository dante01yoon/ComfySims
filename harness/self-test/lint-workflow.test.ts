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
})
