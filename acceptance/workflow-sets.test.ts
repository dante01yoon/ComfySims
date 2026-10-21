import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { lintWorkflow, loadSnapshot } from '../harness/tools/lint-workflow.ts'

const sets: Record<'local' | 'cloud', Record<string, string>> = JSON.parse(readFileSync('workflows/sets.json', 'utf8'))
const snapshots = { local: loadSnapshot(), cloud: loadSnapshot('spec/contracts/comfy-cloud-object-info.json') }
const entries = (['local', 'cloud'] as const).flatMap((backend) => Object.entries(sets[backend]).map(([kind, file]) => ({ backend, kind, file })))

describe('AC-75 each backend has a complete workflow set that its catalog accepts', () => {
  it('AC-75 both sets cover every job kind', () => {
    expect(Object.keys(sets.local).sort()).toEqual(['pano360', 'photo3d', 'product', 'render', 'walkthrough'])
    expect(Object.keys(sets.cloud).sort()).toEqual(['pano360', 'photo3d', 'product', 'render', 'walkthrough'])
  })

  it.for(entries)('AC-75 $backend $kind ($file) lints against the $backend catalog snapshot', ({ backend, file }) => {
    expect(existsSync(`workflows/${file}`)).toBe(true)
    expect(lintWorkflow(JSON.parse(readFileSync(`workflows/${file}`, 'utf8')), snapshots[backend])).toEqual([])
  })
})
