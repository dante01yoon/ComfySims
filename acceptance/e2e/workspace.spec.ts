import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const PHOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const zoneOf = (id: string) => (house.room.kind === 'plan' ? house.room.zones.find((zone) => zone.id === id)! : null)!
const inside = (id: string, p: { x: number; z: number }) => {
  const xs = zoneOf(id).polygon.map((v) => v.x)
  const zs = zoneOf(id).polygon.map((v) => v.z)
  return p.x >= Math.min(...xs) && p.x <= Math.max(...xs) && p.z >= Math.min(...zs) && p.z <= Math.max(...zs)
}
const jobs = (page: Page) => page.getByRole('region', { name: 'Jobs' })
const card = (page: Page, title: string) => jobs(page).getByRole('article', { name: title })
const lamp = (name: string, fileName = 'lamp.png', zoneId = 'garage') => ({
  fileName, imageBase64: PHOTO, name, dimensions: { width: 30, depth: 30, height: 150 }, zoneId
})

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  await page.evaluate(() => window.roomfit.setView('studio'))
})

test('AC-47 finished product and render jobs get cards with a thumbnail and their actions', async ({ page }) => {
  const product = await page.evaluate((request) => window.roomfit.addProductFromPhoto(request), lamp('Lamp'))
  if (!product.ok) throw new Error(product.message)
  const render = await page.evaluate(() => window.roomfit.renderInComfy({ prompt: 'house', seed: 1, size: { width: 576, height: 448 } }))
  if (!render.ok) throw new Error(render.message)

  await expect(card(page, '3D model · Lamp')).toContainText('done')
  await expect(card(page, '3D model · Lamp').getByRole('img')).toBeVisible()
  await expect(card(page, '3D model · Lamp').getByRole('button', { name: 'Show' })).toBeVisible()
  await expect(card(page, 'Room render · House').getByRole('button', { name: 'Open' })).toBeVisible()
  await expect(card(page, 'Room render · House').getByRole('button', { name: 'View as 3D photo' })).toBeVisible()
  await expect(jobs(page).getByRole('article').first()).toHaveAccessibleName('Room render · House')
})

test('AC-47 a failed job shows the ComfyUI message and Retry starts a new job', async ({ page }) => {
  const failed = await page.evaluate((request) => window.roomfit.addProductFromPhoto(request), lamp('Broken', 'please-fail.png'))
  expect(failed).toMatchObject({ ok: false, reason: 'failed' })

  await expect(card(page, '3D model · Broken')).toContainText('out of memory')
  await card(page, '3D model · Broken').getByRole('button', { name: 'Retry' }).click()
  await expect(jobs(page).getByRole('article', { name: '3D model · Broken' })).toHaveCount(2)
})

test('AC-47 a running card shows its step, elapsed seconds and the expected time', async ({ page }) => {
  const running = page.evaluate((request) => window.roomfit.addProductFromPhoto(request), lamp('Slow lamp', 'slow-lamp.png'))
  await expect(card(page, '3D model · Slow lamp')).toContainText('generating', { timeout: 5_000 })
  await expect(card(page, '3D model · Slow lamp')).toContainText(/\d+ s/)
  await expect(card(page, '3D model · Slow lamp')).toContainText('~60 s')
  await running
})

test('AC-48 a render runs while a product is still generating, and controls stay enabled', async ({ page }) => {
  const product = page.evaluate((request) => window.roomfit.addProductFromPhoto(request), lamp('Slow lamp', 'slow-lamp.png'))
  await expect(card(page, '3D model · Slow lamp')).toContainText('generating', { timeout: 5_000 })
  await expect(page.getByRole('button', { name: 'Render this view' })).toBeEnabled()

  const render = await page.evaluate(() => window.roomfit.renderInComfy({ prompt: 'house', seed: 1, size: { width: 576, height: 448 } }))
  if (!render.ok) throw new Error(render.message)
  const state = await page.evaluate(() => window.roomfit.state())
  const productJob = state.jobs.find((job) => job.kind === 'product')!
  expect(productJob.steps.at(-1)!.status).not.toBe('done')

  const placed = await product
  expect(placed.ok).toBe(true)
})

test('AC-48 a fourth job waits as queued until one of three running jobs finishes', async ({ page }) => {
  const all = page.evaluate((requests) => Promise.all(requests.map((request) => window.roomfit.addProductFromPhoto(request))),
    [1, 2, 3, 4].map((n) => lamp(`Lamp ${n}`, `slow-lamp-${n}.png`)))
  await page.waitForFunction(() => window.roomfit.state().jobs.filter((job) => job.steps.some((step) => step.status === 'generating')).length === 3, null, { timeout: 10_000 })

  const state = await page.evaluate(() => window.roomfit.state())
  const waiting = state.jobs.filter((job) => !job.steps.some((step) => step.status === 'uploading'))
  expect(waiting).toHaveLength(1)
  expect(waiting[0]!.steps.map((step) => step.status)).toEqual(['queued'])

  const results = await all
  expect(results.every((result) => result.ok)).toBe(true)
  const after = await page.evaluate(() => window.roomfit.state())
  expect(after.outOfBounds).toEqual([])
  expect(after.collisions).toEqual([])
})

test('AC-50 every room has a label with its item count that focuses the room', async ({ page }) => {
  for (const label of ['Living · 4 items', 'Kitchen & dining · 3 items', 'Bedroom · 3 items', 'Office · 3 items', 'Bath · 1 item', 'Garage · 1 item']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Bedroom · 3 items', exact: true }).click()
  expect(await page.evaluate(() => window.roomfit.state().focusedZone)).toBe('bedroom')
})

test('AC-51 renaming a room from its label updates the chip, the label and the layout, and undoes', async ({ page }) => {
  await page.getByRole('button', { name: 'Office · 3 items', exact: true }).dblclick()
  await page.getByRole('textbox', { name: 'Room name' }).fill('Studio')
  await page.getByRole('textbox', { name: 'Room name' }).press('Enter')

  await expect(page.getByRole('button', { name: 'Studio · 3 items', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Studio', exact: true })).toBeVisible()
  const saved = await page.evaluate(() => window.roomfit.save())
  expect(saved.room.kind === 'plan' && saved.room.zones.find((zone) => zone.id === 'office')!.name).toBe('Studio')

  expect(await page.evaluate(() => window.roomfit.renameZone('office', '   '))).toEqual({ ok: false, reason: 'empty-name' })
  await page.evaluate(() => window.roomfit.undo())
  await expect(page.getByRole('button', { name: 'Office · 3 items', exact: true })).toBeVisible()
})

test('AC-52 the library lists assets and places one in a room, undoably', async ({ page }) => {
  const library = page.getByRole('region', { name: 'Library' })
  const armchair = library.getByRole('listitem').filter({ hasText: 'Armchair' })
  await expect(armchair).toContainText('80 × 80 × 80 cm')
  await expect(library.getByRole('listitem')).toHaveCount(house.assets.length)

  const placed = await page.evaluate(() => window.roomfit.placeAsset('asset-armchair', 'bedroom'))
  if (!placed.ok) throw new Error(placed.reason)
  const state = await page.evaluate(() => window.roomfit.state())
  const item = state.layout.items.find((candidate) => candidate.id === placed.itemId)!
  expect(inside('bedroom', item.position)).toBe(true)
  expect(state.selectedId).toBe(placed.itemId)
  expect(state.outOfBounds).toEqual([])
  expect(state.collisions).toEqual([])
  await page.evaluate(() => window.roomfit.undo())
  expect((await page.evaluate(() => window.roomfit.state())).layout.items.some((candidate) => candidate.id === placed.itemId)).toBe(false)

  await armchair.getByRole('button', { name: 'Place in' }).click()
  await page.getByRole('menuitem', { name: 'Garage' }).click()
  const garage = (await page.evaluate(() => window.roomfit.state())).layout.items.filter((candidate) => candidate.assetId === 'asset-armchair' && inside('garage', candidate.position))
  expect(garage).toHaveLength(1)
})

test('AC-52 placing reports unknown assets and full rooms and changes nothing', async ({ page }) => {
  const before = await page.evaluate(() => window.roomfit.save())
  expect(await page.evaluate(() => window.roomfit.placeAsset('asset-car', 'bath'))).toEqual({ ok: false, reason: 'no-space' })
  expect(await page.evaluate(() => window.roomfit.placeAsset('asset-nope', 'bath'))).toEqual({ ok: false, reason: 'unknown-asset' })
  expect(await page.evaluate(() => window.roomfit.placeAsset('asset-armchair', 'attic'))).toEqual({ ok: false, reason: 'unknown-zone' })
  expect(await page.evaluate(() => window.roomfit.save())).toEqual(before)
})

test('AC-53 a finished render opens as a 3D photo with limited turning', async ({ page }) => {
  const render = await page.evaluate(() => window.roomfit.renderInComfy({ prompt: 'house', seed: 1, size: { width: 576, height: 448 } }))
  if (!render.ok) throw new Error(render.message)
  await card(page, 'Room render · House').getByRole('button', { name: 'View as 3D photo' }).click()

  await expect(card(page, '3D photo · House')).toContainText('done', { timeout: 15_000 })
  const viewer = page.getByRole('dialog', { name: '3D photo' })
  await expect(viewer).toBeVisible()
  const box = (await viewer.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 700, box.y + box.height / 2 - 500, { steps: 10 })
  await page.mouse.up()
  const turned = (await page.evaluate(() => window.roomfit.state().photoViewer))!
  expect(Math.abs(turned.yawDegrees)).toBeGreaterThan(5)
  expect(Math.abs(turned.yawDegrees)).toBeLessThanOrEqual(20.001)
  expect(Math.abs(turned.pitchDegrees)).toBeLessThanOrEqual(10.001)

  await viewer.getByRole('button', { name: 'Back' }).click()
  expect(await page.evaluate(() => window.roomfit.state().photoViewer)).toBeNull()
})

test('AC-53 an uploaded room photo becomes a 3D photo job, with the upload note shown', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Library' })).toContainText('The photo is sent to your ComfyUI to build the 3D photo.')
  const outcome = await page.evaluate((imageBase64) => window.roomfit.photo3d({ kind: 'upload', fileName: 'my-room.jpg', imageBase64 }), PHOTO)
  if (!outcome.ok) throw new Error(outcome.message)

  await expect(card(page, '3D photo · my-room.jpg')).toContainText('done')
  expect((await page.evaluate(() => window.roomfit.state().photoViewer))?.jobId).toBe(outcome.jobId)
})
