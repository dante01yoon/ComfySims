import { readFileSync, writeFileSync } from 'node:fs'

import { buildRenderPrompt, createComfyClient, savedFiles } from '../packages/comfy/src/index.ts'

const [depthPath, out] = process.argv.slice(2)
const client = createComfyClient({ baseUrl: 'http://127.0.0.1:5179/comfy' })
const template = JSON.parse(readFileSync('workflows/render-from-depth.json', 'utf8'))
const uploaded = await client.upload(new Blob([readFileSync(depthPath!)], { type: 'image/png' }), 'exterior-street-depth.png')
if (!uploaded.ok) throw new Error(uploaded.message)
const variants = [
  { name: 'A-current', seed: 11, prompt: 'Exterior architectural photograph of a modern single-storey house, flat roof, white render walls, large windows, green lawn, trees, clear sky, photorealistic', negative: 'blurry, distorted, low quality' },
  { name: 'B-bungalow', seed: 11, prompt: 'Exterior architectural photograph of a single-storey bungalow, one floor only, low wide house, flat roof, white render walls, large windows at ground level, green lawn, trees, clear sky, photorealistic', negative: 'second floor, two storeys, upper floor windows, multi-storey building, blurry, distorted, low quality' },
  { name: 'C-bungalow-seed2', seed: 29, prompt: 'Exterior architectural photograph of a single-storey bungalow, one floor only, low wide house, flat roof, white render walls, large windows at ground level, green lawn, trees, clear sky, photorealistic', negative: 'second floor, two storeys, upper floor windows, multi-storey building, blurry, distorted, low quality' }
]
for (const variant of variants) {
  const built = buildRenderPrompt(template, { depthImageName: uploaded.name, prompt: variant.prompt, negativePrompt: variant.negative, seed: variant.seed })
  if (!built.ok) throw new Error(built.missing.join(','))
  const latent = Object.values(built.prompt).find((node) => node.class_type === 'EmptySD3LatentImage')!
  latent.inputs.width = 1024
  latent.inputs.height = 576
  const started = Date.now()
  const queued = await client.queue(built.prompt)
  if (!queued.ok) throw new Error(queued.message)
  const done = await client.waitForJob(queued.id)
  if (!done.ok) throw new Error(done.message)
  const [file] = savedFiles(built.prompt, done.outputs)
  const image = await client.download(file!)
  if (!image.ok) throw new Error(image.message)
  writeFileSync(`${out}/${variant.name}.png`, image.bytes)
  console.log(variant.name, (Date.now() - started) / 1000, 's', queued.id)
}
