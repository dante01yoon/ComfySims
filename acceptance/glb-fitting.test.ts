import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { fitGlb } from '../packages/fit/src/index.ts'
import { measureGlb } from '../harness/tools/measure-glb.ts'

const sofa = { width: 200, depth: 90, height: 85 }
const offsetBox = 'fixtures/glb/generated-offset-box.glb'
const squashedBox = 'fixtures/glb/generated-squashed-box.glb'
const outputDir = mkdtempSync(join(tmpdir(), 'roomfit-fit-'))
let outputCount = 0
const nextTarget = () => join(outputDir, `fitted-${outputCount++}.glb`)

async function fit(source: string, mode?: 'exact' | 'uniform') {
  const target = nextTarget()
  const report = await fitGlb({ source, target, dimensions: sofa, mode })
  return { report, measured: await measureGlb(target) }
}

describe('AC-3 exact fit', () => {
  it.for([offsetBox, squashedBox])('AC-3 fits %s to 200×90×85 cm within ±1 cm per axis', async (source) => {
    const { measured } = await fit(source)

    expect(Math.abs(measured.sizeCm.width - sofa.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(measured.sizeCm.depth - sofa.depth)).toBeLessThanOrEqual(1)
    expect(Math.abs(measured.sizeCm.height - sofa.height)).toBeLessThanOrEqual(1)
  })
})

describe('AC-4 bottom-center pivot', () => {
  it.for([
    { source: offsetBox, mode: 'exact' as const },
    { source: squashedBox, mode: 'exact' as const },
    { source: squashedBox, mode: 'uniform' as const }
  ])('AC-4 $mode fit of $source sits on the floor at the origin', async ({ source, mode }) => {
    const { measured } = await fit(source, mode)

    expect(Math.abs(measured.minCm.y)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(measured.centerCm.x)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(measured.centerCm.z)).toBeLessThanOrEqual(0.5)
  })
})

describe('AC-11 uniform fit', () => {
  it('AC-11 keeps the squashed source proportions and stays inside the listed box', async () => {
    const source = await measureGlb(squashedBox)
    const { measured } = await fit(squashedBox, 'uniform')

    const ratio = (size: { width: number; height: number; depth: number }) => [
      size.height / size.width,
      size.depth / size.width
    ]
    ratio(measured.sizeCm).forEach((value, index) => {
      expect(Math.abs(value / ratio(source.sizeCm)[index]! - 1)).toBeLessThanOrEqual(0.005)
    })
    const slack = [
      sofa.width - measured.sizeCm.width,
      sofa.depth - measured.sizeCm.depth,
      sofa.height - measured.sizeCm.height
    ]
    slack.forEach((gap) => expect(gap).toBeGreaterThanOrEqual(-1))
    expect(Math.min(...slack.map(Math.abs))).toBeLessThanOrEqual(1)
  })
})

describe('AC-12 fit report', () => {
  it.for([
    { source: offsetBox, mode: 'exact' as const, scale: { x: 2, y: 2, z: 2 }, distortion: 1, flagged: false },
    { source: squashedBox, mode: 'exact' as const, scale: { x: 2, y: 85 / 30, z: 2 }, distortion: 85 / 60, flagged: true },
    { source: squashedBox, mode: 'uniform' as const, scale: { x: 2, y: 2, z: 2 }, distortion: 1, flagged: false }
  ])('AC-12 reports scale and distortion for $mode fit of $source', async ({ source, mode, ...expected }) => {
    const { report } = await fit(source, mode)

    expect(report.mode).toBe(mode)
    expect(report.scale.x).toBeCloseTo(expected.scale.x, 3)
    expect(report.scale.y).toBeCloseTo(expected.scale.y, 3)
    expect(report.scale.z).toBeCloseTo(expected.scale.z, 3)
    expect(report.distortion).toBeCloseTo(expected.distortion, 3)
    expect(report.flagged).toBe(expected.flagged)
  })
})
