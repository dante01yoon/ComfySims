import { WebIO, getBounds, type Document } from '@gltf-transform/core'

import type { Dimensions, FitMode } from '../../schema/src/index.ts'

export type Vec3 = { x: number; y: number; z: number }

export type FitReport = {
  mode: FitMode
  scale: Vec3
  distortion: number
  flagged: boolean
}

export const DISTORTION_FLAG_THRESHOLD = 1.15

// Frame (ADR-0002): width = X, height = Y, depth = Z. Sizes in cm.
export function fitScale(sourceCm: Vec3, dimensions: Dimensions, mode: FitMode): Vec3 {
  const exact = { x: dimensions.width / sourceCm.x, y: dimensions.height / sourceCm.y, z: dimensions.depth / sourceCm.z }
  if (mode === 'exact') return exact
  const factor = Math.min(exact.x, exact.y, exact.z)
  return { x: factor, y: factor, z: factor }
}

export function fitReport(mode: FitMode, scale: Vec3): FitReport {
  const factors = [scale.x, scale.y, scale.z]
  const distortion = Math.max(...factors) / Math.min(...factors)
  return { mode, scale, distortion, flagged: distortion > DISTORTION_FLAG_THRESHOLD }
}

export type FitFailureReason = 'unreadable' | 'no-scene' | 'degenerate-bounds'

export type FitOutcome = { ok: true; report: FitReport } | { ok: false; reason: FitFailureReason }

export type FitBytesOutcome = { ok: true; bytes: Uint8Array; report: FitReport } | { ok: false; reason: FitFailureReason }

async function readGlb(io: WebIO, bytes: Uint8Array): Promise<Document | undefined> {
  try {
    return await io.readBinary(bytes)
  } catch {
    return undefined
  }
}

/** Scales GLB bytes to the listed dimensions with the pivot at bottom center; failures are returned, never thrown. */
export async function fitGlbBytes(bytes: Uint8Array, dimensions: Dimensions, mode: FitMode = 'exact'): Promise<FitBytesOutcome> {
  const io = new WebIO()
  const document = await readGlb(io, bytes)
  if (!document) return { ok: false, reason: 'unreadable' }
  const root = document.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  if (!scene) return { ok: false, reason: 'no-scene' }

  const { min, max } = getBounds(scene)
  const sizeCm = { x: (max[0] - min[0]) * 100, y: (max[1] - min[1]) * 100, z: (max[2] - min[2]) * 100 }
  if (!(sizeCm.x > 0 && sizeCm.y > 0 && sizeCm.z > 0)) return { ok: false, reason: 'degenerate-bounds' }

  const scale = fitScale(sizeCm, dimensions, mode)
  const pivot = document.createNode('roomfit-fit')
    .setScale([scale.x, scale.y, scale.z])
    .setTranslation([-scale.x * (min[0] + max[0]) / 2, -scale.y * min[1], -scale.z * (min[2] + max[2]) / 2])
  for (const child of scene.listChildren()) pivot.addChild(child)
  scene.addChild(pivot)

  return { ok: true, bytes: await io.writeBinary(document), report: fitReport(mode, scale) }
}

async function readSource(path: string): Promise<Uint8Array> {
  const { readFile } = await import('node:fs/promises')
  return readFile(path).catch(() => new Uint8Array())
}

/** Scales a GLB file to the listed dimensions with its pivot at bottom center; failures are returned, never thrown. */
export async function fitGlb(input: {
  source: string
  target: string
  dimensions: Dimensions
  mode?: FitMode
}): Promise<FitOutcome> {
  const outcome = await fitGlbBytes(await readSource(input.source), input.dimensions, input.mode)
  if (!outcome.ok) return outcome
  const { writeFile } = await import('node:fs/promises')
  await writeFile(input.target, outcome.bytes)
  return { ok: true, report: outcome.report }
}
