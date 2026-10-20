import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const HEAVY = readFileSync('fixtures/glb/heavy-generated.glb')
const HEAVY_URL = 'https://assets.comfysims.test/heavy-generated.glb'
const PHOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const UNOPTIMISED_TEXTURE_BYTES_PER_PIECE = 3 * 2048 * 2048 * 4 * (4 / 3)

const withHeavyPieces = (count: number): RoomLayout => ({
  ...house,
  assets: house.assets.map((asset, index) => (index < count ? { ...asset, uri: `${HEAVY_URL}?piece=${index}` } : asset)),
  items: house.items
})

async function serveHeavy(page: Page): Promise<() => number> {
  let requests = 0
  await page.context().route(`${HEAVY_URL}*`, async (route) => {
    requests += 1
    await route.fulfill({ body: HEAVY, contentType: 'model/gltf-binary', headers: { 'access-control-allow-origin': '*' } })
  })
  return () => requests
}

const loaded = (page: Page) => page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 120_000 })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate(() => window.roomfit.clearAssetCache())
})

test.afterEach(async () => {
  await fetch('http://127.0.0.1:8199/__product-glb?fixture=generated-offset-box.glb')
})

test('AC-127 a heavy generated product becomes a light asset, optimised off the main thread', async ({ page }) => {
  await fetch('http://127.0.0.1:8199/__product-glb?fixture=heavy-generated.glb')
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  const outcome = await page.evaluate(
    (photo) => window.roomfit.addProductFromPhoto({ fileName: 'chair.png', imageBase64: photo, name: 'Heavy chair', dimensions: { width: 70, depth: 80, height: 75 }, zoneId: 'living' }),
    PHOTO
  )
  if (!outcome.ok) throw new Error(JSON.stringify(outcome))
  const stats = await page.evaluate((assetId) => window.roomfit.assetStats(assetId), outcome.assetId)
  if (!stats) throw new Error('no stats')
  expect(stats.triangles).toBeLessThanOrEqual(25_000)
  expect(stats.textures.length).toBeGreaterThan(0)
  expect(stats.textures.every(({ width, height, mimeType }) => width <= 512 && height <= 512 && mimeType === 'image/webp')).toBe(true)
  expect(stats.bytes).toBeLessThanOrEqual(HEAVY.length * 0.2)
  const job = await page.evaluate((jobId) => window.roomfit.state().jobs.find(({ id }) => id === jobId), outcome.jobId)
  expect(job?.steps.map(({ status }) => status)).toContain('optimising')
  const asset = await page.evaluate((assetId) => window.roomfit.state().layout.assets.find(({ id }) => id === assetId), outcome.assetId)
  expect(asset?.fit?.optimised?.trianglesBefore).toBe(119_600)
  expect(asset?.fit?.optimised?.trianglesAfter).toBe(stats.triangles)
  expect((await page.evaluate(() => window.roomfit.renderStats())).mainThreadFits).toBe(0)
})

test('AC-128 reloading a layout takes its pieces from the cache, and clearing the cache downloads again', async ({ page }) => {
  const requests = await serveHeavy(page)
  const layout = withHeavyPieces(3)
  await page.evaluate((value) => window.roomfit.load(value), layout)
  await loaded(page)
  const first = requests()
  expect(first).toBe(3)

  await page.reload()
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((value) => window.roomfit.load(value), layout)
  await loaded(page)
  expect(requests()).toBe(first)

  await page.evaluate(() => window.roomfit.clearAssetCache())
  await page.reload()
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((value) => window.roomfit.load(value), layout)
  await loaded(page)
  expect(requests()).toBe(first + 3)
})

test('AC-129 switching views keeps the canvas size', async ({ page }) => {
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  await page.evaluate(() => window.roomfit.setView('editor'))
  const editor = await page.locator('canvas').first().boundingBox()
  await page.evaluate(() => window.roomfit.setView('studio'))
  await page.waitForFunction(() => !window.roomfit.cameraMoving())
  const studio = await page.locator('canvas').first().boundingBox()
  expect(studio?.width).toBe(editor?.width)
  expect(studio?.height).toBe(editor?.height)
})

test('AC-130 render stats count draw calls, triangles and texture memory, and optimised pieces use under a quarter of it', async ({ page }) => {
  await serveHeavy(page)
  const pieces = 4
  await page.evaluate((value) => window.roomfit.load(value), withHeavyPieces(pieces))
  await loaded(page)
  await page.evaluate(() => window.roomfit.setView('studio'))
  await page.waitForFunction(() => !window.roomfit.cameraMoving())
  await page.waitForTimeout(500)
  const stats = await page.evaluate(() => window.roomfit.renderStats())
  expect(stats.drawCalls).toBeGreaterThan(0)
  expect(stats.triangles).toBeGreaterThan(0)
  expect(stats.geometries).toBeGreaterThan(0)
  expect(stats.textures).toBeGreaterThan(0)
  expect(stats.textureBytes).toBeGreaterThan(0)
  expect(stats.textureBytes).toBeLessThanOrEqual(pieces * UNOPTIMISED_TEXTURE_BYTES_PER_PIECE * 0.25)
})

test('AC-132 thumbnails render once outside React, are saved on the asset, and are not rendered again on reload', async ({ page }) => {
  await serveHeavy(page)
  const layout = withHeavyPieces(2)
  await page.evaluate((value) => window.roomfit.load(value), layout)
  await loaded(page)
  await page.waitForFunction(() => window.roomfit.state().layout.assets.slice(0, 2).every((asset) => asset.thumbnail), null, { timeout: 30_000 })
  const rendered = (await page.evaluate(() => window.roomfit.renderStats())).thumbnailRenders
  expect(rendered).toBeGreaterThanOrEqual(2)
  const saved = await page.evaluate(() => window.roomfit.save())

  await page.reload()
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((value) => window.roomfit.load(value), saved)
  await loaded(page)
  await page.waitForTimeout(1000)
  expect((await page.evaluate(() => window.roomfit.renderStats())).thumbnailRenders).toBe(0)
})

async function houseOnScreen(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    const wrapper = canvas.parentElement!
    const midY = rect.top + rect.height / 2
    let visibleRight = rect.left
    for (let x = rect.right - 1; x > rect.left; x -= 2) {
      const hit = document.elementFromPoint(x, midY)
      if (hit && (hit === canvas || wrapper.contains(hit))) {
        visibleRight = x
        break
      }
    }
    const room = window.roomfit.state().layout.room
    if (room.kind !== 'plan') throw new Error('expected a plan')
    const xs = room.walls.flatMap((wall) => [wall.from.x, wall.to.x])
    const zs = room.walls.flatMap((wall) => [wall.from.z, wall.to.z])
    const corners = [Math.min(...xs), Math.max(...xs)].flatMap((x) => [Math.min(...zs), Math.max(...zs)].flatMap((z) => [0, room.wallHeight].map((y) => ({ x, y, z }))))
    const points = corners.map((corner) => window.roomfit.projectToScreen(corner)).filter((point) => point !== null)
    return { left: rect.left, right: visibleRight, xs: points.map(({ x }) => x), count: corners.length, projected: points.length }
  })
}

for (const view of ['editor', 'studio'] as const) {
  test(`AC-134 the whole house is framed in the part of the canvas no panel covers (${view})`, async ({ page }) => {
    await page.evaluate((layout) => window.roomfit.load(layout), house)
    await page.evaluate((next) => window.roomfit.setView(next), view)
    await page.waitForFunction(() => !window.roomfit.cameraMoving())
    const { left, right, xs, count, projected } = await houseOnScreen(page)
    expect(projected).toBe(count)
    const width = right - left
    expect(Math.min(...xs)).toBeGreaterThan(left + width * 0.02)
    expect(Math.max(...xs)).toBeLessThan(right - width * 0.02)
    const centre = (Math.min(...xs) + Math.max(...xs)) / 2
    expect(Math.abs(centre - (left + right) / 2)).toBeLessThan(width * 0.1)
  })
}

for (const size of [{ width: 800, height: 450 }, { width: 1600, height: 900 }]) {
  test(`AC-135 the bottom bar and room chips sit in the part of the canvas no panel covers (${size.width}×${size.height})`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.evaluate((layout) => window.roomfit.load(layout), house)
    await page.evaluate(() => window.roomfit.setView('studio'))
    await page.waitForFunction(() => !window.roomfit.cameraMoving())
    for (const control of [page.getByRole('button', { name: 'Walk', exact: true }), page.getByRole('button', { name: 'Living', exact: true }), page.getByRole('button', { name: 'Evening', exact: true })]) {
      await expect(control).toBeVisible()
      const box = (await control.boundingBox())!
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim() ?? null, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
      expect(hit).toBe(await control.textContent().then((text) => text?.trim() ?? null))
    }
  })
}
