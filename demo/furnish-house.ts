import { readFileSync, writeFileSync } from 'node:fs'

import { buildPhotoTo3dPrompt, createComfyClient, savedFiles } from '../packages/comfy/src/index.ts'
import { fitGlbBytes } from '../packages/fit/src/index.ts'

const photos: Record<string, string> = {
  sofa: '7bd44c6e0f742b6374543e3c0e65ff4baaf86c8106f45f4546c2c383c1597d97.png',
  'coffee-table': '78b0ad35ca142fe6445e183e4c62f1e177509c79006a45859050e2ab81d03fb6.png',
  'tv-unit': 'febe0ddf88260bda54b401682af91979ca55b5747e5be6189fcb176e971620e9.png',
  armchair: '0f338d41d5fd58b544beb0a900587319171f7825f6795ad03018cce217156661.png',
  'dining-table': '856862fbf586e7848b1886158ce6de676b82cb869807fb532bf2be45e5effab8.png',
  'dining-chair': 'a5f0c46c53720745d23087dbfcbf973a32dc75fa21986c1b8f320b661d17e697.png',
  'kitchen-counter': '2109747d563ea970de0c8043245282c3c2569a26e80f9333417d21a0feadbc53.png',
  bed: '05ddd0211286b8e057a07e4842baf361ce884bea8704a7e9261027914c3f5953.png',
  nightstand: 'c036cfd9394c96f5187da78a518d6582d708475984181fbd46c493d5b87a825b.png',
  wardrobe: '4cd9b3a6683ad16a8211675a19995750b3628365ea6fe4daafc0b0475bc12343.png',
  desk: '0b29709587cd5c43dcf78544de376065118ff3019b6936a399f1aa00112f6a37.png',
  'desk-chair': '882c8eef314947655898eb9eb1ab9cab66337dfcae668ce288962dc04a9d28c6.png',
  bookshelf: '04fd4f9bac0b19760f659da633b6dfdfa934a8de82d773358f4896fa7db93a18.png',
  bathtub: '8ecd119cd02b9c6eca1d4f8db9294d5aae146be5cb4dea86f35f4a7af7789857.png',
  car: '14977b1b1a6f2454806b406db1436d6f7f99a3edbc9abb20d3b91bbae257d862.png'
}
const house = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const workflow = JSON.parse(readFileSync('workflows/cloud/product-to-glb-pixal3d.json', 'utf8'))
const comfy = createComfyClient({ baseUrl: 'http://127.0.0.1:5179/comfy', pollMs: 3000 })
const started = Date.now()
const log = (message: string) => console.log(`${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s ${message}`)

const queued = await Promise.all(Object.entries(photos).map(async ([id, imageName], index) => {
  const built = buildPhotoTo3dPrompt(workflow, { imageName, seed: 1000 + index })
  if (!built.ok) throw new Error(`${id}: missing ${built.missing.join(', ')}`)
  const job = await comfy.queue(built.prompt)
  if (!job.ok) throw new Error(`${id}: ${job.message}`)
  log(`queued ${id}`)
  return { id, prompt: built.prompt, jobId: job.id }
}))

const results = await Promise.all(queued.map(async ({ id, prompt, jobId }) => {
  const finished = await comfy.waitForJob(jobId)
  if (!finished.ok) { log(`FAILED ${id}: ${finished.message}`); return { id, ok: false as const, message: finished.message } }
  const [file] = savedFiles(prompt, finished.outputs)
  const downloaded = await comfy.download(file!)
  if (!downloaded.ok) return { id, ok: false as const, message: downloaded.message }
  const asset = house.assets.find((candidate: { id: string }) => candidate.id === `asset-${id}`)
  const fitted = await fitGlbBytes(downloaded.bytes, asset.dimensions, 'exact')
  if (!fitted.ok) return { id, ok: false as const, message: fitted.reason }
  writeFileSync(`demo/out/house/${id}.glb`, fitted.bytes)
  log(`done ${id}  distortion ${fitted.report.distortion.toFixed(2)}${fitted.report.flagged ? ' (flagged)' : ''}`)
  return { id, ok: true as const, jobId, uri: `comfy-output:${file!.subfolder}/${file!.filename}`, distortion: Number(fitted.report.distortion.toFixed(4)) }
}))

writeFileSync('demo/out/house/results.json', JSON.stringify({ seconds: (Date.now() - started) / 1000, results }, null, 2))
log(`finished: ${results.filter((result) => result.ok).length}/${results.length}`)
