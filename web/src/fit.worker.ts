import { fitGlbBytes, glbIO, optimizeGlbBytes } from '../../packages/fit/src/index.ts'
import type { ResizeImage } from '../../packages/fit/src/index.ts'
import type { FitJob, FitResult, GlbStats } from './fit-jobs.ts'

const WEBP_QUALITY = 0.9

const resizeImage: ResizeImage = async (image, mimeType, { width, height }) => {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(image)], { type: mimeType }), {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: 'high',
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none'
  })
  const canvas = new OffscreenCanvas(width, height)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
  bitmap.close()
  const encoded = await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY })
  return { image: new Uint8Array(await encoded.arrayBuffer()), mimeType: encoded.type }
}

async function statsOf(bytes: Uint8Array): Promise<GlbStats> {
  const root = (await glbIO().readBinary(bytes)).getRoot()
  const triangles = root
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3, 0)
  const textures = root.listTextures().map((texture) => {
    const [width = 0, height = 0] = texture.getSize() ?? []
    return { width, height, mimeType: texture.getMimeType() }
  })
  return { triangles, textures, bytes: bytes.length }
}

async function processed({ bytes, largestCm, fit }: FitJob): Promise<FitResult> {
  if (fit) {
    const fitted = await fitGlbBytes(bytes, fit.dimensions, fit.mode, { optimise: { resizeImage } })
    return fitted.ok ? { ok: true, bytes: fitted.bytes, fit: fitted.report, optimised: fitted.report.optimised, stats: await statsOf(fitted.bytes) } : fitted
  }
  const optimised = await optimizeGlbBytes(bytes, { largestCm, resizeImage })
  return optimised.ok ? { ok: true, bytes: optimised.bytes, fit: null, optimised: optimised.report, stats: await statsOf(optimised.bytes) } : optimised
}

self.onmessage = async ({ data }: MessageEvent<FitJob & { id: number }>) => {
  const result = await processed(data).catch((error: unknown): FitResult => ({ ok: false, reason: String(error) }))
  const buffer = result.ok ? result.bytes.buffer : null
  self.postMessage({ id: data.id, result }, { transfer: buffer instanceof ArrayBuffer ? [buffer] : [] })
}
