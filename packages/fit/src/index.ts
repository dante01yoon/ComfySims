import { getBounds } from '@gltf-transform/core'
import type { Document, Scene, WebIO, vec4 } from '@gltf-transform/core'

import type { Dimensions, FitMode } from '../../schema/src/index.ts'
import { glbIO, optimizeGlb } from './optimize.ts'
import type { OptimiseReport, ResizeImage } from './optimize.ts'

export { glbIO, optimizeGlb, optimizeGlbBytes } from './optimize.ts'
export type { OptimiseReport, ResizeImage } from './optimize.ts'

export type Vec3 = { x: number; y: number; z: number }

export type AppliedFitMode = Exclude<FitMode, 'auto'>

export type FitAlign = 'auto' | 'none'

export type FitReport = {
  mode: AppliedFitMode
  requested: FitMode
  yawDegrees: number
  scale: Vec3
  distortion: number
  flagged: boolean
  optimised?: OptimiseReport
}

export const DISTORTION_FLAG_THRESHOLD = 1.15

const YAW_STEP_DEGREES = 0.5

export function fitScale(sourceCm: Vec3, dimensions: Dimensions, mode: AppliedFitMode): Vec3 {
  const exact = { x: dimensions.width / sourceCm.x, y: dimensions.height / sourceCm.y, z: dimensions.depth / sourceCm.z }
  if (mode === 'exact') return exact
  const factor = Math.min(exact.x, exact.y, exact.z)
  return { x: factor, y: factor, z: factor }
}

function distortionOf(scale: Vec3): number {
  const factors = [scale.x, scale.y, scale.z]
  return Math.max(...factors) / Math.min(...factors)
}

/** Resolves `auto` to `exact` when the exact fit stays within the distortion threshold, else `uniform`. */
export function appliedMode(sourceCm: Vec3, dimensions: Dimensions, mode: FitMode): AppliedFitMode {
  if (mode !== 'auto') return mode
  return distortionOf(fitScale(sourceCm, dimensions, 'exact')) <= DISTORTION_FLAG_THRESHOLD ? 'exact' : 'uniform'
}

export function fitReport(mode: AppliedFitMode, scale: Vec3, requested: FitMode = mode, yawDegrees = 0): FitReport {
  const distortion = distortionOf(scale)
  return { mode, requested, yawDegrees, scale, distortion, flagged: distortion > DISTORTION_FLAG_THRESHOLD }
}

function footprintPoints(scene: Scene): number[] {
  const points: number[] = []
  const position: number[] = []
  scene.traverse((node) => {
    const m = node.getWorldMatrix()
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const accessor = primitive.getAttribute('POSITION')
      const count = accessor?.getCount() ?? 0
      for (let index = 0; index < count; index++) {
        accessor?.getElement(index, position)
        const [x = 0, y = 0, z = 0] = position
        points.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[2] * x + m[6] * y + m[10] * z + m[14])
      }
    }
  })
  return points
}

function footprintAt(points: number[], degrees: number): { x: number; z: number } {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let index = 0; index < points.length; index += 2) {
    const x = points[index] ?? 0
    const z = points[index + 1] ?? 0
    const turnedX = cos * x + sin * z
    const turnedZ = cos * z - sin * x
    minX = Math.min(minX, turnedX)
    maxX = Math.max(maxX, turnedX)
    minZ = Math.min(minZ, turnedZ)
    maxZ = Math.max(maxZ, turnedZ)
  }
  return { x: maxX - minX, z: maxZ - minZ }
}

function smallestFootprintYaw(points: number[]): number {
  const areaAt = (degrees: number) => {
    const footprint = footprintAt(points, degrees)
    return footprint.x * footprint.z
  }
  let best = 0
  let bestArea = areaAt(0)
  for (let degrees = YAW_STEP_DEGREES; degrees < 90; degrees += YAW_STEP_DEGREES) {
    const area = areaAt(degrees)
    if (area < bestArea * (1 - 1e-9)) {
      best = degrees
      bestArea = area
    }
  }
  return best
}

/** The yaw in degrees that gives the smallest footprint with its long side on the longer listed axis (width → X, depth → Z). */
export function alignedYaw(points: number[], dimensions: Dimensions): number {
  const yaw = smallestFootprintYaw(points)
  const footprint = footprintAt(points, yaw)
  const crossed = dimensions.width > dimensions.depth ? footprint.x < footprint.z : dimensions.width < dimensions.depth && footprint.x > footprint.z
  return crossed ? yaw + 90 : yaw
}

function yawRotation(degrees: number): vec4 {
  const half = (degrees * Math.PI) / 360
  return [0, Math.sin(half), 0, Math.cos(half)]
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

export type FitOptions = { align?: FitAlign; optimise?: { resizeImage: ResizeImage } }

/** Optimises GLB bytes when asked (see `optimizeGlb`), turns them to their smallest footprint and scales them to the listed dimensions with the pivot at bottom center; failures are returned, never thrown. */
export async function fitGlbBytes(
  bytes: Uint8Array,
  dimensions: Dimensions,
  mode: FitMode = 'exact',
  { align = 'auto', optimise }: FitOptions = {}
): Promise<FitBytesOutcome> {
  const io = glbIO()
  const document = await readGlb(io, bytes)
  if (!document) return { ok: false, reason: 'unreadable' }
  const root = document.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  if (!scene) return { ok: false, reason: 'no-scene' }
  const largestCm = Math.max(dimensions.width, dimensions.depth, dimensions.height)
  const counts = optimise && (await optimizeGlb(document, { largestCm, resizeImage: optimise.resizeImage }))

  const yawDegrees = align === 'auto' ? alignedYaw(footprintPoints(scene), dimensions) : 0
  const turn = document.createNode('roomfit-align').setRotation(yawRotation(yawDegrees))
  for (const child of scene.listChildren()) turn.addChild(child)
  scene.addChild(turn)

  const { min, max } = getBounds(scene)
  const sizeCm = { x: (max[0] - min[0]) * 100, y: (max[1] - min[1]) * 100, z: (max[2] - min[2]) * 100 }
  if (!(sizeCm.x > 0 && sizeCm.y > 0 && sizeCm.z > 0)) return { ok: false, reason: 'degenerate-bounds' }

  const applied = appliedMode(sizeCm, dimensions, mode)
  const scale = fitScale(sizeCm, dimensions, applied)
  const pivot = document.createNode('roomfit-fit')
    .setScale([scale.x, scale.y, scale.z])
    .setTranslation([-scale.x * (min[0] + max[0]) / 2, -scale.y * min[1], -scale.z * (min[2] + max[2]) / 2])
  scene.removeChild(turn)
  pivot.addChild(turn)
  scene.addChild(pivot)

  const written = await io.writeBinary(document)
  const report = fitReport(applied, scale, mode, yawDegrees)
  return { ok: true, bytes: written, report: counts ? { ...report, optimised: { ...counts, bytesBefore: bytes.length, bytesAfter: written.length } } : report }
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
  align?: FitAlign
}): Promise<FitOutcome> {
  const outcome = await fitGlbBytes(await readSource(input.source), input.dimensions, input.mode, { align: input.align })
  if (!outcome.ok) return outcome
  const { writeFile } = await import('node:fs/promises')
  await writeFile(input.target, outcome.bytes)
  return { ok: true, report: outcome.report }
}
