import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { fitGlbBytes } from '../packages/fit/src/index.ts'
import { measureGlb } from '../harness/tools/measure-glb.ts'

const dir = mkdtempSync(join(tmpdir(), 'roomfit-align-'))
const wide = { width: 200, depth: 90, height: 85 }
const deep = { width: 90, depth: 200, height: 85 }
let count = 0

async function fitted(fixture: string, dimensions: typeof wide, options: Parameters<typeof fitGlbBytes>[3] = undefined, mode: 'exact' | 'uniform' | 'auto' = 'exact') {
  const outcome = await fitGlbBytes(readFileSync(`fixtures/glb/${fixture}`), dimensions, mode, options)
  if (!outcome.ok) throw new Error(outcome.reason)
  const target = join(dir, `${count++}.glb`)
  writeFileSync(target, outcome.bytes)
  return { report: outcome.report, measured: await measureGlb(target) }
}

describe('AC-36 yaw alignment before fitting', () => {
  it.for([
    { fixture: 'generated-yawed-box.glb', dimensions: wide },
    { fixture: 'generated-yawed-deep-box.glb', dimensions: wide },
    { fixture: 'generated-yawed-deep-box.glb', dimensions: deep }
  ])('AC-36 $fixture turned to its smallest footprint fits $dimensions.width × $dimensions.depth without distortion', async ({ fixture, dimensions }) => {
    const { report, measured } = await fitted(fixture, dimensions)

    expect(report.distortion).toBeLessThanOrEqual(1.01)
    expect(report.flagged).toBe(false)
    expect(Math.abs(measured.sizeCm.width - dimensions.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(measured.sizeCm.depth - dimensions.depth)).toBeLessThanOrEqual(1)
    expect(Math.abs(measured.minCm.y)).toBeLessThanOrEqual(0.5)
  })

  it('AC-36 reports the yaw it applied and can be switched off', async () => {
    const aligned = await fitted('generated-yawed-box.glb', wide)
    const raw = await fitted('generated-yawed-box.glb', wide, { align: 'none' })

    expect(Math.abs(aligned.report.yawDegrees)).toBeGreaterThan(30)
    expect(raw.report.yawDegrees).toBe(0)
    expect(raw.report.flagged).toBe(true)
  })

  it('AC-36 leaves an already aligned model unturned', async () => {
    expect((await fitted('generated-offset-box.glb', wide)).report.yawDegrees).toBe(0)
  })
})

describe('AC-37 auto fit mode', () => {
  it.for([
    { fixture: 'generated-offset-box.glb', chosen: 'exact' },
    { fixture: 'generated-yawed-box.glb', chosen: 'exact' },
    { fixture: 'generated-squashed-box.glb', chosen: 'uniform' }
  ])('AC-37 picks $chosen for $fixture', async ({ fixture, chosen }) => {
    const { report } = await fitted(fixture, wide, undefined, 'auto')

    expect(report).toMatchObject({ requested: 'auto', mode: chosen, flagged: false })
  })
})
