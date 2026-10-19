const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export type FetchedImage = { ok: true; bytes: Buffer; contentType: string } | { ok: false; status: 400 | 413 | 415 | 502; message: string }

function isHttpUrl(url: string): boolean {
  return URL.canParse(url) && ['http:', 'https:'].includes(new URL(url).protocol)
}

async function cappedBytes(body: ReadableStream<Uint8Array>): Promise<Buffer | null> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of body) {
    total += chunk.byteLength
    if (total > MAX_IMAGE_BYTES) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** Downloads a product photo from an http(s) URL: images only, at most 15 MB. */
export async function fetchImage(url: string): Promise<FetchedImage> {
  if (!isHttpUrl(url)) return { ok: false, status: 400, message: 'the photo URL must be http(s)' }
  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    return { ok: false, status: 502, message: `could not fetch the photo: ${String(error)}` }
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok || !response.body) return { ok: false, status: 502, message: `the photo answered ${response.status}` }
  if (!contentType.startsWith('image/')) return { ok: false, status: 415, message: `not an image (${contentType || 'no content type'})` }
  if (Number(response.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) return { ok: false, status: 413, message: 'the photo is larger than 15 MB' }
  const bytes = await cappedBytes(response.body)
  return bytes ? { ok: true, bytes, contentType } : { ok: false, status: 413, message: 'the photo is larger than 15 MB' }
}
