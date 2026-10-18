import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildPhotoTo3dPrompt, createComfyClient, savedFiles } from '../packages/comfy/src/index.ts'
import { startFakeComfy } from '../harness/tools/fake-comfy.mjs'
import type { ApiWorkflow } from '../harness/tools/lint-workflow.ts'

const PORT = 8189
let fake: Awaited<ReturnType<typeof startFakeComfy>>
const client = () => createComfyClient({ baseUrl: `http://127.0.0.1:${PORT}`, pollMs: 10 })
const cloudProduct: ApiWorkflow = JSON.parse(readFileSync('workflows/cloud/product-to-glb-pixal3d.json', 'utf8'))

beforeAll(async () => {
  fake = await startFakeComfy({ port: PORT, storagePort: 8188 + 2000 })
})
afterAll(() => fake.close())

describe('AC-21 ComfyUI client', () => {
  it('AC-21 uploads, queues, waits through statuses and downloads the saved GLB', async () => {
    const comfy = client()
    const uploaded = await comfy.upload(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'sofa.png')
    if (!uploaded.ok) throw new Error('upload failed')
    const built = buildPhotoTo3dPrompt(cloudProduct, { imageName: uploaded.name, seed: 5 })
    if (!built.ok) throw new Error(`missing ${built.missing.join(', ')}`)

    const queued = await comfy.queue(built.prompt)
    if (!queued.ok) throw new Error('queue failed')
    const statuses: string[] = []
    const finished = await comfy.waitForJob(queued.id, { onStatus: (status) => statuses.push(status) })
    if (!finished.ok) throw new Error(finished.message)
    const [file] = savedFiles(built.prompt, finished.outputs)
    const downloaded = await comfy.download(file!)

    expect(fake.prompts.get(queued.id)!.prompt['122'].inputs.image).toBe(uploaded.name)
    expect(fake.prompts.get(queued.id)!.prompt['3'].inputs.seed).toBe(5)
    expect(statuses).toEqual(['in_progress', 'completed'])
    expect(file).toEqual({ filename: 'product_00001_.glb', subfolder: 'roomfit', type: 'output' })
    expect(downloaded.ok && new TextDecoder().decode(downloaded.bytes.slice(0, 4))).toBe('glTF')
  })

  it('AC-21 returns a failed job as data with the ComfyUI error message', async () => {
    const comfy = client()
    const uploaded = await comfy.upload(new Blob([new Uint8Array([1])]), 'please-fail.png')
    if (!uploaded.ok) throw new Error('upload failed')
    const built = buildPhotoTo3dPrompt(cloudProduct, { imageName: uploaded.name, seed: 1 })
    if (!built.ok) throw new Error('build failed')
    const queued = await comfy.queue(built.prompt)
    if (!queued.ok) throw new Error('queue failed')

    const finished = await comfy.waitForJob(queued.id)

    expect(finished).toMatchObject({ ok: false, reason: 'failed' })
    expect(finished.ok ? '' : finished.message).toContain('out of memory')
  })

  it('AC-21 reports an unknown job and an unreachable server without throwing', async () => {
    expect(await client().waitForJob('job-unknown')).toMatchObject({ ok: false, reason: 'http' })
    const offline = createComfyClient({ baseUrl: 'http://127.0.0.1:9', pollMs: 10 })
    expect(await offline.queue({})).toMatchObject({ ok: false, reason: 'unreachable' })
  })

  it('AC-21 buildPhotoTo3dPrompt lists missing tags in order', () => {
    expect(buildPhotoTo3dPrompt({}, { imageName: 'x.png', seed: 1 })).toEqual({
      ok: false,
      missing: ['roomfit:product-image', 'roomfit:seed', 'roomfit:save']
    })
  })
})
