import { expect, test } from '@playwright/test'

import { FAKE_COMFY_KEY } from '../../playwright.config.ts'
import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const PHOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const emptyRoom: RoomLayout = {
  version: 1, id: 'bridge', name: 'Bridge room', units: 'cm',
  room: { kind: 'box', width: 420, depth: 360, height: 240 }, assets: [], items: []
}
type Logged = { server: string; method: string; url: string; headers: Record<string, string | undefined> }
const fakeRequests = async (): Promise<Logged[]> => (await fetch('http://127.0.0.1:8199/__requests')).json()

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), emptyRoom)
})

test('AC-23 a product photo becomes a real-size item through ComfyUI', async ({ page }) => {
  const outcome = await page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({
    fileName: 'sofa.png', imageBase64, name: 'Sofa', dimensions: { width: 200, depth: 90, height: 85 }
  }), PHOTO)
  if (!outcome.ok) throw new Error(outcome.message)

  const state = await page.evaluate(() => window.roomfit.state())
  const asset = state.layout.assets.find((candidate) => state.layout.items.some((item) => item.id === outcome.itemId && item.assetId === candidate.id))!
  const item = (await page.evaluate(() => window.roomfit.scene())).find((candidate) => candidate.id === outcome.itemId)!

  expect(outcome.report).toEqual({ mode: 'exact', distortion: 1, flagged: false })
  expect(asset).toMatchObject({ name: 'Sofa', dimensions: { width: 200, depth: 90, height: 85 }, fit: { mode: 'exact', distortion: 1 } })
  expect(asset.uri).toBe('comfy-output:roomfit/product_00001_.glb')
  expect(item.meshLoaded).toBe(true)
  expect(item.worldBoundsCm.max.y).toBeCloseTo(85, 0)
  expect(state.jobs.at(-1)).toMatchObject({ kind: 'product', status: 'done' })
  expect(state.jobs.filter((job) => job.kind === 'product').map((job) => job.status)).toEqual(
    expect.arrayContaining(['uploading', 'queued', 'in_progress', 'downloading', 'fitting', 'done'])
  )
})

test('AC-23 a saved layout with a ComfyUI asset reloads and re-fits the mesh', async ({ page }) => {
  await page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({
    fileName: 'sofa.png', imageBase64, name: 'Sofa', dimensions: { width: 200, depth: 90, height: 85 }, mode: 'uniform'
  }), PHOTO)
  const saved = await page.evaluate(() => window.roomfit.save())

  await page.reload()
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), saved)
  await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 15_000 })

  expect(saved.assets[0]!.fit).toEqual({ mode: 'uniform', distortion: 1 })
})

test('AC-23 a failed ComfyUI job is reported and leaves the layout untouched', async ({ page }) => {
  const outcome = await page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({
    fileName: 'please-fail.png', imageBase64, name: 'Broken', dimensions: { width: 100, depth: 50, height: 40 }
  }), PHOTO)

  expect(outcome).toMatchObject({ ok: false, reason: 'failed' })
  const state = await page.evaluate(() => window.roomfit.state())
  expect(state.layout).toEqual(emptyRoom)
  expect(state.jobs.at(-1)).toMatchObject({ kind: 'product', status: 'failed' })
  expect(state.jobs.at(-1)!.message).toContain('out of memory')
})

test('AC-24 render sends the depth pass and prompt to ComfyUI and shows the result', async ({ page }) => {
  const outcome = await page.evaluate(() => window.roomfit.renderInComfy({ prompt: 'cozy scandinavian living room', seed: 7, size: { width: 576, height: 448 } }))
  if (!outcome.ok) throw new Error(outcome.message)

  const state = await page.evaluate(() => window.roomfit.state())
  expect(outcome.image.startsWith('data:image/png;base64,') || outcome.image.startsWith('blob:')).toBe(true)
  expect(state.lastRender).toBe(outcome.image)
  expect(state.jobs.at(-1)).toMatchObject({ kind: 'render', status: 'done' })
  const prompts = (await fakeRequests()).filter((request) => request.method === 'POST' && request.url === '/api/prompt')
  expect(prompts.length).toBeGreaterThan(0)
})

test('AC-25 the API key is added by the dev server and never reaches the browser or the storage redirect', async ({ page }) => {
  const browserHeaders: string[] = []
  const bodies: string[] = []
  page.on('request', (request) => { if (request.headers()['x-api-key']) browserHeaders.push(request.url()) })
  page.on('response', async (response) => { if (/\.(js|ts|tsx|html)(\?|$)|\/$/.test(response.url())) bodies.push(await response.text().catch(() => '')) })
  await page.reload()
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), emptyRoom)
  await page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({
    fileName: 'sofa.png', imageBase64, name: 'Sofa', dimensions: { width: 200, depth: 90, height: 85 }
  }), PHOTO)

  const logged = await fakeRequests()
  const api = logged.filter((request) => request.server === 'api' && request.url.startsWith('/api/'))
  const storage = logged.filter((request) => request.server === 'storage')

  expect(browserHeaders).toEqual([])
  expect(bodies.join('\n')).not.toContain(FAKE_COMFY_KEY)
  expect(api.length).toBeGreaterThan(0)
  expect(api.every((request) => request.headers['x-api-key'] === FAKE_COMFY_KEY)).toBe(true)
  expect(storage.length).toBeGreaterThan(0)
  expect(storage.every((request) => request.headers['x-api-key'] === undefined)).toBe(true)
})

test('AC-26 the side panel drives the same flow with labelled controls', async ({ page }) => {
  await page.getByLabel('Product photo').setInputFiles({ name: 'sofa.png', mimeType: 'image/png', buffer: Buffer.from(PHOTO, 'base64') })
  await page.getByLabel('Product name').fill('Sofa')
  await page.getByLabel('Width (cm)').fill('200')
  await page.getByLabel('Depth (cm)').fill('90')
  await page.getByLabel('Height (cm)').fill('85')
  await page.getByRole('button', { name: 'Generate 3D' }).click()
  await expect(page.getByRole('status')).toContainText('Placed', { timeout: 20_000 })

  await page.getByLabel('Render prompt').fill('cozy living room')
  await page.getByRole('button', { name: 'Render' }).click()
  await expect(page.getByRole('img', { name: 'Render result' })).toBeVisible({ timeout: 20_000 })
})

test('AC-28 the render result opens large over the view and closes', async ({ page }) => {
  await page.getByLabel('Render prompt').fill('cozy living room')
  await page.getByRole('button', { name: 'Render' }).click()
  const result = page.getByRole('img', { name: 'Render result' })
  await expect(result).toBeVisible({ timeout: 20_000 })

  const box = await result.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width / 2)

  await page.getByRole('button', { name: 'Close' }).click()
  await expect(result).toBeHidden()
})

test('AC-28 the status line shows the step and elapsed seconds while a job runs', async ({ page }) => {
  await page.getByLabel('Product photo').setInputFiles({ name: 'sofa.png', mimeType: 'image/png', buffer: Buffer.from(PHOTO, 'base64') })
  await page.getByLabel('Product name').fill('Sofa')
  await page.getByLabel('Width (cm)').fill('200')
  await page.getByLabel('Depth (cm)').fill('90')
  await page.getByLabel('Height (cm)').fill('85')
  const seen: string[] = []
  const poll = setInterval(async () => { seen.push((await page.getByRole('status').textContent().catch(() => '')) ?? '') }, 50)
  await page.getByRole('button', { name: 'Generate 3D' }).click()
  await expect(page.getByRole('status')).toContainText('Placed', { timeout: 20_000 })
  clearInterval(poll)

  expect(seen.some((text) => /\d+\s?s\b/.test(text))).toBe(true)
  await expect(page.getByRole('status')).toContainText('distortion')
})
