import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { fitGlbBytes } from '../packages/fit/src/index.ts'
import { measureGlb } from '../harness/tools/measure-glb.ts'

const sofa = { width: 200, depth: 90, height: 85 }
const dir = mkdtempSync(join(tmpdir(), 'roomfit-bytes-'))

describe('AC-22 fitting GLB bytes without a file system', () => {
  it.for(['exact', 'uniform'] as const)('AC-22 %s fit of bytes matches the file-based fit', async (mode) => {
    const outcome = await fitGlbBytes(readFileSync('fixtures/glb/generated-squashed-box.glb'), sofa, mode)
    if (!outcome.ok) throw new Error(outcome.reason)
    const target = join(dir, `${mode}.glb`)
    writeFileSync(target, outcome.bytes)
    const measured = await measureGlb(target)

    expect(Math.abs(measured.minCm.y)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(measured.sizeCm.height - (mode === 'exact' ? 85 : 60))).toBeLessThanOrEqual(1)
    expect(outcome.report.mode).toBe(mode)
    expect(outcome.report.flagged).toBe(mode === 'exact')
  })

  it('AC-22 returns unreadable for bytes that are not a GLB', async () => {
    expect(await fitGlbBytes(new TextEncoder().encode('nope'), sofa, 'exact')).toEqual({ ok: false, reason: 'unreadable' })
  })
})
