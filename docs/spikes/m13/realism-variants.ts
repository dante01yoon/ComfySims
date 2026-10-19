import { readFileSync, writeFileSync } from 'node:fs'

import { buildRenderPrompt, createComfyClient, savedFiles } from '../packages/comfy/src/index.ts'

const out = 'demo/out/realism'
const client = createComfyClient({ baseUrl: 'http://127.0.0.1:5179/comfy' })
const template = JSON.parse(readFileSync('workflows/render-from-depth.json', 'utf8'))
const upload = async (path: string, name: string) => {
  const uploaded = await client.upload(new Blob([readFileSync(path)], { type: 'image/png' }), name)
  if (!uploaded.ok) throw new Error(uploaded.message)
  return uploaded.name
}
const depth = await upload(`${out}/depth.png`, 'realism-depth.png')
const color = await upload(`${out}/studio-color.png`, 'realism-color.png')
const aware = 'Photograph of a lived-in living room in the evening: grey fabric three-seat sofa with cushions and a throw, oak coffee table with books and a mug, low wooden TV unit, upholstered armchair, warm walnut wood floor, wool rug, warm greige painted walls, linen curtains, houseplants, framed prints, a floor lamp and table lamp glowing, realistic interior photography, natural imperfections, real home'
const negative = 'empty room, white walls, sterile, showroom, CGI, 3d render, cartoon, blurry, distorted, low quality, text'
const variants = [
  { name: 'B-aware-prompt', prompt: aware, strength: 1.0, img2img: false },
  { name: 'C-aware-strength07', prompt: aware, strength: 0.7, img2img: false },
  { name: 'D-aware-img2img', prompt: aware, strength: 0.6, img2img: true }
]
for (const variant of variants) {
  const built = buildRenderPrompt(template, { depthImageName: depth, prompt: variant.prompt, negativePrompt: negative, seed: 21 })
  if (!built.ok) throw new Error(built.missing.join(','))
  const graph = built.prompt as Record<string, { class_type: string; inputs: Record<string, unknown> }>
  graph['6']!.inputs.strength = variant.strength
  graph['10']!.inputs.width = 1152
  graph['10']!.inputs.height = 896
  if (variant.img2img) {
    graph['c1'] = { class_type: 'LoadImage', inputs: { image: color } }
    graph['c2'] = { class_type: 'ImageScale', inputs: { image: ['c1', 0], upscale_method: 'lanczos', width: 1152, height: 896, crop: 'center' } }
    graph['c3'] = { class_type: 'VAEEncode', inputs: { pixels: ['c2', 0], vae: ['3', 0] } }
    graph['11']!.inputs.latent_image = ['c3', 0]
    graph['11']!.inputs.denoise = 0.7
  }
  const started = Date.now()
  const queued = await client.queue(graph as never)
  if (!queued.ok) throw new Error(queued.message)
  const done = await client.waitForJob(queued.id)
  if (!done.ok) throw new Error(done.message)
  const [file] = savedFiles(graph as never, done.outputs)
  const image = await client.download(file!)
  if (!image.ok) throw new Error(image.message)
  writeFileSync(`${out}/${variant.name}.png`, image.bytes)
  console.log(variant.name, (Date.now() - started) / 1000, 's', queued.id)
}
