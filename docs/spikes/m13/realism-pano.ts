import { readFileSync, writeFileSync } from 'node:fs'

import { buildRenderPrompt, createComfyClient, savedFiles } from '../packages/comfy/src/index.ts'

const client = createComfyClient({ baseUrl: 'http://127.0.0.1:5179/comfy' })
const template = JSON.parse(readFileSync('workflows/cloud/pano360-from-depth.json', 'utf8'))
const uploaded = await client.upload(new Blob([readFileSync('demo/out/pano360/depth.png')], { type: 'image/png' }), 'realism-pano-depth.png')
if (!uploaded.ok) throw new Error(uploaded.message)
const prompt = 'equirectangular 360 image, photograph of a lived-in Scandinavian bedroom in the evening: queen bed with rumpled linen bedding and pillows, oak nightstand with a lamp and books, tall white wardrobe, a reading corner with a light oak armchair with cream boucle upholstery and an oak tripod floor lamp, walnut wood floor, wool rug, warm greige painted walls, linen curtains, framed prints, houseplants, warm lamp light, realistic interior photography, natural imperfections'
const negative = 'empty room, white walls, sterile, showroom, CGI, 3d render, cartoon, blurry, distorted, low quality, text, watermark, seam'
const built = buildRenderPrompt(template, { depthImageName: uploaded.name, prompt, negativePrompt: negative, seed: 42 })
if (!built.ok) throw new Error(built.missing.join(','))
const queued = await client.queue(built.prompt)
if (!queued.ok) throw new Error(queued.message)
const done = await client.waitForJob(queued.id)
if (!done.ok) throw new Error(done.message)
const [file] = savedFiles(built.prompt, done.outputs)
const image = await client.download(file!)
if (!image.ok) throw new Error(image.message)
writeFileSync('demo/out/realism/pano-aware.png', image.bytes)
console.log('pano', queued.id)
