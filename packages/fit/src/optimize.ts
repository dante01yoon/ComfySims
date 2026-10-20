import { WebIO } from '@gltf-transform/core'
import type { Document, Texture } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'
import { dedup, prune, simplify, weld } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'

/** Resizes and re-encodes one texture image; the caller provides it (OffscreenCanvas in a worker, a fake in tests). */
export type ResizeImage = (image: Uint8Array, mimeType: string, size: { width: number; height: number }) => Promise<{ image: Uint8Array; mimeType: string }>

export type OptimiseOptions = { largestCm: number; resizeImage: ResizeImage }

export type OptimiseReport = {
  trianglesBefore: number
  trianglesAfter: number
  bytesBefore: number
  bytesAfter: number
  textureSizeBefore: number
  textureSizeAfter: number
}

export type OptimiseBytesOutcome = { ok: true; bytes: Uint8Array; report: OptimiseReport } | { ok: false; reason: 'unreadable' | 'no-scene' }

const TRIANGLE_BUDGET = 25_000
const MAX_ERROR_OF_SIZE = 0.005
const LARGE_PIECE_CM = 100
const TEXTURE_PX = { large: 1024, small: 512 }
const WEBP = 'image/webp'

/** A WebIO that also reads and writes WebP textures. */
export function glbIO(): WebIO {
  return new WebIO().registerExtensions([EXTTextureWebP])
}

function triangleCount(document: Document): number {
  return document
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3, 0)
}

function largestTextureSide(document: Document): number {
  return Math.max(0, ...document.getRoot().listTextures().map((texture) => Math.max(...(texture.getSize() ?? [0, 0]))))
}

function texturePx(largestCm: number): number {
  return largestCm >= LARGE_PIECE_CM ? TEXTURE_PX.large : TEXTURE_PX.small
}

async function resizeTexture(texture: Texture, sidePx: number, resizeImage: ResizeImage): Promise<void> {
  const image = texture.getImage()
  const [width, height] = texture.getSize() ?? [0, 0]
  if (!image || width === 0 || height === 0) return
  const scale = Math.min(1, sidePx / Math.max(width, height))
  if (scale === 1 && texture.getMimeType() === WEBP) return
  const size = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
  const resized = await resizeImage(image, texture.getMimeType(), size)
  texture.setImage(resized.image).setMimeType(resized.mimeType)
}

/** Welds and simplifies a mesh to the triangle budget, drops unused data and resizes its textures to the piece's size; returns before/after counts (bytes are left to the caller). */
export async function optimizeGlb(document: Document, { largestCm, resizeImage }: OptimiseOptions): Promise<Omit<OptimiseReport, 'bytesBefore' | 'bytesAfter'>> {
  const trianglesBefore = triangleCount(document)
  const textureSizeBefore = largestTextureSide(document)
  if (trianglesBefore > TRIANGLE_BUDGET) {
    await MeshoptSimplifier.ready
    await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: TRIANGLE_BUDGET / trianglesBefore, error: MAX_ERROR_OF_SIZE, lockBorder: true }))
  }
  await document.transform(prune({ keepSolidTextures: true }), dedup())
  const sidePx = texturePx(largestCm)
  for (const texture of document.getRoot().listTextures()) await resizeTexture(texture, sidePx, resizeImage)
  if (document.getRoot().listTextures().some((texture) => texture.getMimeType() === WEBP)) document.createExtension(EXTTextureWebP).setRequired(true)
  return { trianglesBefore, trianglesAfter: triangleCount(document), textureSizeBefore, textureSizeAfter: largestTextureSide(document) }
}

/** Reads GLB bytes, optimises them (see `optimizeGlb`) and writes them back; failures are returned, never thrown. */
export async function optimizeGlbBytes(bytes: Uint8Array, options: OptimiseOptions): Promise<OptimiseBytesOutcome> {
  const io = glbIO()
  const document = await io.readBinary(bytes).catch(() => undefined)
  if (!document) return { ok: false, reason: 'unreadable' }
  if (document.getRoot().listScenes().length === 0) return { ok: false, reason: 'no-scene' }
  const counts = await optimizeGlb(document, options)
  const written = await io.writeBinary(document)
  return { ok: true, bytes: written, report: { ...counts, bytesBefore: bytes.length, bytesAfter: written.length } }
}
