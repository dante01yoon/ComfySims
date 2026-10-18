import { NodeIO, getBounds, type Document } from '@gltf-transform/core'

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

async function readGlb(io: NodeIO, path: string): Promise<Document | undefined> {
  try {
    return await io.read(path)
  } catch {
    return undefined
  }
}

/** Scales a GLB to the listed dimensions with its pivot at bottom center; failures are returned, never thrown. */
export async function fitGlb(input: {
  source: string
  target: string
  dimensions: Dimensions
  mode?: FitMode
}): Promise<FitOutcome> {
  const mode = input.mode ?? 'exact'
  const io = new NodeIO()
  const document = await readGlb(io, input.source)
  if (!document) return { ok: false, reason: 'unreadable' }
  const root = document.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  if (!scene) return { ok: false, reason: 'no-scene' }

  const { min, max } = getBounds(scene)
  const sizeCm = { x: (max[0] - min[0]) * 100, y: (max[1] - min[1]) * 100, z: (max[2] - min[2]) * 100 }
  if (!(sizeCm.x > 0 && sizeCm.y > 0 && sizeCm.z > 0)) return { ok: false, reason: 'degenerate-bounds' }

  const scale = fitScale(sizeCm, input.dimensions, mode)
  const pivot = document.createNode('roomfit-fit')
    .setScale([scale.x, scale.y, scale.z])
    .setTranslation([-scale.x * (min[0] + max[0]) / 2, -scale.y * min[1], -scale.z * (min[2] + max[2]) / 2])
  for (const child of scene.listChildren()) pivot.addChild(child)
  scene.addChild(pivot)

  await io.write(input.target, document)
  return { ok: true, report: fitReport(mode, scale) }
}
