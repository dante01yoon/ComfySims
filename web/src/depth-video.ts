import { BufferTarget, CanvasSource, Output, QUALITY_HIGH, WebMOutputFormat } from 'mediabunny'

type Size = { width: number; height: number }

/** Encodes frames to a VP9 WebM in the browser (WebCodecs through mediabunny's WebM muxer). */
export async function webmOf(size: Size, fps: number, frameCount: number, frameAt: (index: number) => ImageData): Promise<Blob> {
  const canvas = new OffscreenCanvas(size.width, size.height)
  const context = canvas.getContext('2d')!
  const source = new CanvasSource(canvas, { codec: 'vp9', quality: QUALITY_HIGH })
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()
  for (let index = 0; index < frameCount; index++) {
    context.putImageData(frameAt(index), 0, 0)
    await source.add(index / fps, 1 / fps)
  }
  await output.finalize()
  return new Blob([output.target.buffer!], { type: 'video/webm' })
}
