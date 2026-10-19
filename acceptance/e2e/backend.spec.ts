import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'
import { FAKE_COMFY_KEY } from '../../playwright.config.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const PHOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const CLOUD = 'http://127.0.0.1:8199'
const LOCAL = 'http://127.0.0.1:8196'
type Logged = { server: string; method: string; url: string; headers: Record<string, string | undefined> }
const requestsOf = async (base: string) => ((await (await fetch(`${base}/__requests`)).json()) as Logged[]).filter((entry) => entry.server === 'api')
const promptsQueued = async (base: string) => (await requestsOf(base)).filter((entry) => entry.method === 'POST' && entry.url === '/api/prompt').length
const chip = (page: Page) => page.getByRole('button', { name: /^(Cloud|Local) · / })
const card = (page: Page, title: string) => page.getByRole('region', { name: 'Jobs' }).getByRole('article', { name: title })
const render = (page: Page) => page.evaluate(() => window.roomfit.renderInComfy({ prompt: 'house', seed: 1, size: { width: 576, height: 448 } }))

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  await page.evaluate(() => window.roomfit.setView('studio'))
  await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
})
test.afterEach(async ({ page }) => {
  if (!page.isClosed()) {
    await page.evaluate((url) => window.roomfit.setBackend({ kind: 'local', url }), LOCAL)
    await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
  }
})

test('AC-70 the backend switch sends new jobs to the chosen ComfyUI without a restart', async ({ page }) => {
  await expect(chip(page)).toHaveAccessibleName('Cloud · ready')
  expect(await page.evaluate(() => window.roomfit.state().backend)).toMatchObject({ kind: 'cloud', url: CLOUD, status: 'ready', unavailable: [], cloudConfigured: true })

  await chip(page).click()
  await page.getByRole('button', { name: 'Use Local' }).click()
  await expect(chip(page)).toHaveAccessibleName('Local · 2 workflows unavailable')
  const [cloudBefore, localBefore] = [await promptsQueued(CLOUD), await promptsQueued(LOCAL)]
  const outcome = await render(page)
  if (!outcome.ok) throw new Error(outcome.message)

  expect(await promptsQueued(LOCAL)).toBe(localBefore + 1)
  expect(await promptsQueued(CLOUD)).toBe(cloudBefore)
  expect((await page.evaluate(() => window.roomfit.state().jobs)).find((job) => job.id === outcome.jobId)?.backend).toBe('local')
})

test('AC-70 a running job keeps polling the backend it started on after a switch', async ({ page }) => {
  const running = page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({ fileName: 'slow-lamp.png', imageBase64, name: 'Slow lamp', dimensions: { width: 30, depth: 30, height: 150 }, zoneId: 'garage' }), PHOTO)
  await expect(card(page, '3D model · Slow lamp')).toContainText('generating', { timeout: 5_000 })
  await page.evaluate(() => window.roomfit.setBackend({ kind: 'local' }))
  const cloudPollsAtSwitch = (await requestsOf(CLOUD)).filter((entry) => entry.url.startsWith('/api/jobs/')).length
  const localPollsAtSwitch = (await requestsOf(LOCAL)).filter((entry) => entry.url.startsWith('/api/jobs/')).length

  const outcome = await running
  expect(outcome.ok).toBe(true)
  expect((await requestsOf(CLOUD)).filter((entry) => entry.url.startsWith('/api/jobs/')).length).toBeGreaterThan(cloudPollsAtSwitch)
  expect((await requestsOf(LOCAL)).filter((entry) => entry.url.startsWith('/api/jobs/')).length).toBe(localPollsAtSwitch)
})

test('AC-71 only Cloud requests carry the key, the browser never sees it, and the switch refuses other origins', async ({ page }) => {
  await page.evaluate(() => window.roomfit.setBackend({ kind: 'local' }))
  const outcome = await render(page)
  if (!outcome.ok) throw new Error(outcome.message)
  await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
  const cloudRender = await render(page)
  if (!cloudRender.ok) throw new Error(cloudRender.message)

  expect((await requestsOf(LOCAL)).every((entry) => entry.headers['x-api-key'] === undefined)).toBe(true)
  expect((await requestsOf(CLOUD)).filter((entry) => entry.url.startsWith('/api/')).every((entry) => entry.headers['x-api-key'] === FAKE_COMFY_KEY)).toBe(true)
  expect(JSON.stringify(await page.evaluate(() => window.roomfit.state()))).not.toContain(FAKE_COMFY_KEY)
  expect(await page.content()).not.toContain(FAKE_COMFY_KEY)

  const foreign = await fetch('http://127.0.0.1:5179/__roomfit/backend', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' }, body: JSON.stringify({ kind: 'local' }) })
  expect(foreign.status).toBe(403)
})

test('AC-72 readiness names the missing nodes and models, and disables what cannot run', async ({ page }) => {
  const state = await page.evaluate(() => window.roomfit.setBackend({ kind: 'local' }))
  const missing = Object.fromEntries(state.unavailable.map(({ kind, missing: names }) => [kind, [...names].sort()]))
  expect(missing).toEqual({
    photo3d: ['MoGePointMapToMesh'],
    pano360: ['Qwen-Image-2512-Fun-Controlnet-Union-2602.safetensors']
  })

  const outcome = await render(page)
  if (!outcome.ok) throw new Error(outcome.message)
  const toPhoto = card(page, 'Room render · House').getByRole('button', { name: 'View as 3D photo' })
  await expect(toPhoto).toBeDisabled()
  await expect(toPhoto).toHaveAttribute('title', /MoGePointMapToMesh/)
  await page.evaluate(() => window.roomfit.focusZone('bedroom'))
  const pano = page.getByRole('button', { name: '360° view' })
  await expect(pano).toBeDisabled()
  await expect(pano).toHaveAttribute('title', /Qwen-Image-2512-Fun-Controlnet-Union-2602\.safetensors/)

  const unreachable = await page.evaluate(() => window.roomfit.setBackend({ kind: 'local', url: 'http://127.0.0.1:8190' }))
  expect(unreachable.status).toBe('unreachable')
  await expect(chip(page)).toHaveAccessibleName('Local · unreachable')
})

test('AC-73 every job opens the workflow it ran, and Download JSON is exactly what was submitted', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const outcome = await render(page)
  if (!outcome.ok) throw new Error(outcome.message)
  const submitted = await (await fetch(`${CLOUD}/__last-prompt`)).json()

  expect(await page.evaluate((jobId) => window.roomfit.jobWorkflow(jobId), outcome.jobId)).toEqual({ file: 'render-from-depth.json', backend: 'cloud', submitted })
  await card(page, 'Room render · House').getByRole('button', { name: 'Workflow' }).click()
  const panel = page.getByRole('dialog', { name: 'Workflow' })
  await expect(panel).toContainText('render-from-depth.json')
  await expect(panel).toContainText('Cloud')
  await expect(panel).toContainText('roomfit:depth')
  await expect(panel).toContainText('LoadImage')

  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download JSON' }).click()
  const file = await (await download).path()
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(submitted)

  const popup = page.waitForEvent('popup')
  await panel.getByRole('button', { name: 'Open in ComfyUI' }).click()
  expect((await popup).url().startsWith(CLOUD)).toBe(true)
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(submitted)
  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(panel).toBeHidden()
})
