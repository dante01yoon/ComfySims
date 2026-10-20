import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebIO } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'

import { fitGlbBytes, optimizeGlbBytes } from '../packages/fit/src/index.ts'
import type { ResizeImage } from '../packages/fit/src/index.ts'
import { measureGlb } from '../harness/tools/measure-glb.ts'
import { png } from '../harness/tools/build-heavy-fixture.ts'

const heavy = readFileSync('fixtures/glb/heavy-generated.glb')
const dir = mkdtempSync(join(tmpdir(), 'comfysims-optimise-'))

function recordingResizer() {
  const calls: { width: number; height: number; mimeType: string }[] = []
  const resize: ResizeImage = async (_image, mimeType, size) => {
    calls.push({ ...size, mimeType })
    return { image: png(size.width, () => [100, 100, 100, 255]), mimeType: 'image/png' }
  }
  return { calls, resize }
}

async function inspect(bytes: Uint8Array) {
  const document = await new WebIO().readBinary(bytes)
  const triangles = document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives()).reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')!.getCount()) / 3, 0)
  const textures = document.getRoot().listTextures().map((texture) => texture.getSize() ?? [0, 0])
  return { triangles, textures }
}

const measure = async (bytes: Uint8Array, name: string) => {
  const path = join(dir, name)
  writeFileSync(path, bytes)
  return measureGlb(path)
}

describe('AC-125 optimizeGlbBytes makes a generated mesh light without changing its shape', () => {
  it('AC-125 the heavy fixture drops to the triangle budget, keeps its bounds and resizes textures by size', async () => {
    const original = await measure(heavy, 'original.glb')
    const { calls, resize } = recordingResizer()
    const outcome = await optimizeGlbBytes(heavy, { largestCm: 80, resizeImage: resize })
    if (!outcome.ok) throw new Error(outcome.reason)
    const { triangles, textures } = await inspect(outcome.bytes)
    expect(triangles).toBeLessThanOrEqual(25_000)
    expect(triangles).toBeGreaterThan(1_000)
    const optimised = await measure(outcome.bytes, 'optimised.glb')
    const tolerance = 0.005 * 80
    for (const axis of ['width', 'height', 'depth'] as const) expect(Math.abs(optimised.sizeCm[axis] - original.sizeCm[axis])).toBeLessThanOrEqual(tolerance)
    expect(calls).toHaveLength(3)
    expect(calls.every(({ width, height }) => width === 512 && height === 512)).toBe(true)
    expect(textures.every(([width, height]) => width === 512 && height === 512)).toBe(true)
    expect(outcome.report).toEqual(expect.objectContaining({ trianglesBefore: 119_600, trianglesAfter: triangles, textureSizeBefore: 2048, textureSizeAfter: 512, bytesBefore: heavy.length }))
    expect(outcome.report.bytesAfter).toBe(outcome.bytes.length)
  })

  it('AC-125 a piece of 100 cm or more gets 1024 px textures', async () => {
    const { calls, resize } = recordingResizer()
    const outcome = await optimizeGlbBytes(heavy, { largestCm: 200, resizeImage: resize })
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(calls.map(({ width, height }) => [width, height])).toEqual([[1024, 1024], [1024, 1024], [1024, 1024]])
  })

  it('AC-125 a light mesh with small textures is left unchanged', async () => {
    const light = readFileSync('fixtures/glb/generated-offset-box.glb')
    const { calls, resize } = recordingResizer()
    const outcome = await optimizeGlbBytes(light, { largestCm: 80, resizeImage: resize })
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(calls).toHaveLength(0)
    expect(outcome.report.trianglesAfter).toBe(outcome.report.trianglesBefore)
  })

  it('AC-125 bytes that are not a GLB are reported, not thrown', async () => {
    const { resize } = recordingResizer()
    expect(await optimizeGlbBytes(new TextEncoder().encode('nope'), { largestCm: 80, resizeImage: resize })).toEqual({ ok: false, reason: 'unreadable' })
  })
})

describe('AC-126 fitting after optimising stays exact', () => {
  it('AC-126 the optimised heavy fixture fits 70 x 80 x 75 cm within 1 cm, bottom-centred, and reports the optimisation', async () => {
    const { resize } = recordingResizer()
    const outcome = await fitGlbBytes(heavy, { width: 70, depth: 80, height: 75 }, 'exact', { optimise: { resizeImage: resize } })
    if (!outcome.ok) throw new Error(outcome.reason)
    const fitted = await measure(outcome.bytes, 'fitted.glb')
    expect(Math.abs(fitted.sizeCm.width - 70)).toBeLessThanOrEqual(1)
    expect(Math.abs(fitted.sizeCm.depth - 80)).toBeLessThanOrEqual(1)
    expect(Math.abs(fitted.sizeCm.height - 75)).toBeLessThanOrEqual(1)
    expect(Math.abs(fitted.minCm.y)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(fitted.centerCm.x)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(fitted.centerCm.z)).toBeLessThanOrEqual(0.5)
    expect(outcome.report.optimised?.trianglesAfter).toBeLessThanOrEqual(25_000)
    expect((await inspect(outcome.bytes)).triangles).toBeLessThanOrEqual(25_000)
  })

  it('AC-126 without the optimise option fitting is unchanged', async () => {
    const outcome = await fitGlbBytes(readFileSync('fixtures/glb/generated-squashed-box.glb'), { width: 200, depth: 90, height: 85 }, 'exact')
    if (!outcome.ok) throw new Error(outcome.reason)
    expect(outcome.report.optimised).toBeUndefined()
  })
})
