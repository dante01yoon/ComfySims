import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const PHOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const chip = (page: Page) => page.getByRole('button', { name: /^(Cloud|Local) · / })
const menu = (page: Page) => page.getByRole('group', { name: 'ComfyUI backend' })
const jobs = (page: Page) => page.getByRole('region', { name: 'Jobs' })
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
  if (!page.isClosed()) await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
})

test('AC-90 the backend menu closes after a choice, on Esc and on an outside click, and never blocks job cards', async ({ page }) => {
  const outcome = await render(page)
  if (!outcome.ok) throw new Error(outcome.message)

  await chip(page).click()
  await expect(menu(page)).toBeVisible()
  await jobs(page).getByRole('article').first().getByRole('button', { name: 'View as 3D photo' }).click({ trial: true, timeout: 3_000 })
  await menu(page).getByRole('button', { name: 'Use Cloud' }).click()
  await expect(menu(page)).toBeHidden()

  await chip(page).click()
  await expect(menu(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()

  await chip(page).click()
  await expect(menu(page)).toBeVisible()
  await page.locator('canvas').first().click({ position: { x: 40, y: 40 } })
  await expect(menu(page)).toBeHidden()
})

test('AC-91 the Workflow dialog fits the window with its title and buttons in view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 })
  const outcome = await page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({ fileName: 'lamp.png', imageBase64, name: 'Lamp', dimensions: { width: 30, depth: 30, height: 150 }, zoneId: 'garage' }), PHOTO)
  if (!outcome.ok) throw new Error(outcome.message)
  await jobs(page).getByRole('article', { name: '3D model · Lamp' }).getByRole('button', { name: 'Workflow' }).click()
  const dialog = page.getByRole('dialog', { name: 'Workflow' })
  await expect(dialog).toBeVisible()

  const box = (await dialog.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(640)
  await expect(dialog.getByText('product-to-glb-pixal3d.json')).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Download JSON' })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport()
})

test('AC-92 a product added with "Place in the house" unticked goes to the library only', async ({ page }) => {
  const before = await page.evaluate(() => window.roomfit.state().layout)
  const outcome = await page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({ fileName: 'lamp.png', imageBase64, name: 'Shelf lamp', dimensions: { width: 30, depth: 30, height: 150 }, place: false }), PHOTO)
  if (!outcome.ok) throw new Error(outcome.message)
  const after = await page.evaluate(() => window.roomfit.state().layout)

  expect(outcome.itemId).toBeNull()
  expect(after.items).toHaveLength(before.items.length)
  expect(after.assets.find((asset) => asset.id === outcome.assetId)?.name).toBe('Shelf lamp')
  await expect(page.getByRole('region', { name: 'Library' }).getByRole('listitem').filter({ hasText: 'Shelf lamp' })).toBeVisible()

  await page.evaluate(() => window.roomfit.setView('editor'))
  const placeBox = page.getByLabel('Place in the house')
  await expect(placeBox).toBeChecked()
  await placeBox.uncheck()
  await page.getByLabel('Product photo').setInputFiles({ name: 'chair.png', mimeType: 'image/png', buffer: Buffer.from(PHOTO, 'base64') })
  await page.getByLabel('Product name').fill('Form chair')
  await page.getByLabel('Width (cm)').fill('60')
  await page.getByLabel('Depth (cm)').fill('60')
  await page.getByLabel('Height (cm)').fill('80')
  await page.getByRole('button', { name: 'Generate 3D' }).click()
  await expect.poll(async () => (await page.evaluate(() => window.roomfit.state().layout.assets)).some((asset) => asset.name === 'Form chair'), { timeout: 15_000 }).toBe(true)
  expect((await page.evaluate(() => window.roomfit.state().layout.items)).length).toBe(before.items.length)
})

test('AC-93 with an item selected in the focused room, the eye-level render looks at it', async ({ page }) => {
  const placed = await page.evaluate(() => window.roomfit.placeAsset(window.roomfit.state().layout.assets.find((asset) => asset.name === 'Armchair')!.id, 'living'))
  if (!placed.ok) throw new Error(placed.reason)
  await page.evaluate((itemId) => { window.roomfit.moveItem(itemId, { x: -620, z: 420 }); window.roomfit.focusZone('living'); window.roomfit.selectItem(itemId) }, placed.itemId)
  const outcome = await render(page)
  if (!outcome.ok) throw new Error(outcome.message)
  const { camera, item } = await page.evaluate((itemId) => ({ camera: window.roomfit.state().lastRenderCamera!, item: window.roomfit.state().layout.items.find((entry) => entry.id === itemId)!.position }), placed.itemId)

  const forward = Math.atan2(camera.target.x - camera.position.x, camera.target.z - camera.position.z)
  const toItem = Math.atan2(item.x - camera.position.x, item.z - camera.position.z)
  const degrees = Math.abs(((((toItem - forward) * 180) / Math.PI + 540) % 360) - 180)
  expect(degrees).toBeLessThanOrEqual(25)
})
