import { readFileSync, writeFileSync } from 'node:fs'

import { createComfyClient, savedFiles } from '../packages/comfy/src/index.ts'

const out = process.argv[2] ?? 'demo/out/brand'
const client = createComfyClient({ baseUrl: 'http://127.0.0.1:5179/comfy' })
const render = JSON.parse(readFileSync('workflows/render-from-depth.json', 'utf8'))
const textToImage = (positive: string, negative: string, seed: number) => {
  const graph = structuredClone(render)
  for (const id of ['4', '5', '6']) delete graph[id]
  graph['7'].inputs.model = ['1', 0]
  graph['8'].inputs.text = positive
  graph['9'].inputs.text = negative
  graph['10'].inputs.width = 1024
  graph['10'].inputs.height = 1024
  graph['11'].inputs.seed = seed
  graph['13'].inputs.filename_prefix = 'comfysims/icon'
  return graph
}
const negative = 'text, letters, words, typography, watermark, signature, diamond, gem, crystal, floating jewel, photo, photorealistic, clutter, noise, blurry, low quality'
const concepts = {
  A: 'App icon for a home design app: a cute isometric miniature house whose roof outline is drawn by glowing node-graph wires linking small rounded nodes, sitting on a small square of green lawn. Flat vector illustration, soft gradients, warm amber and mint teal accents on a deep navy rounded-square background, centered, minimal, high contrast',
  B: 'Minimal logo mark: a simple house silhouette made of three connected rounded rectangles like workflow nodes joined by curved cables, one cable forming the roof peak, small measuring tape ticks along the base. Flat vector, bold geometric shapes, amber, coral and teal on a dark navy rounded square, centered'
}
for (const [name, positive] of Object.entries(concepts)) {
  for (const seed of [3, 17, 42]) {
    const graph = textToImage(positive, negative, seed)
    const queued = await client.queue(graph)
    if (!queued.ok) throw new Error(queued.message)
    const done = await client.waitForJob(queued.id)
    if (!done.ok) throw new Error(done.message)
    const [file] = savedFiles(graph, done.outputs)
    const image = await client.download(file!)
    if (!image.ok) throw new Error(image.message)
    writeFileSync(`${out}/icon-${name}-${seed}.png`, image.bytes)
    console.log(name, seed, queued.id)
  }
}
