import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const PHOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const zone = (id: string) => (house.room.kind === 'plan' ? house.room.zones.find((z) => z.id === id)! : null)!
const inside = (id: string, p: { x: number; z: number }) => {
  const xs = zone(id).polygon.map((v) => v.x)
  const zs = zone(id).polygon.map((v) => v.z)
  return p.x >= Math.min(...xs) && p.x <= Math.max(...xs) && p.z >= Math.min(...zs) && p.z <= Math.max(...zs)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  await page.evaluate(() => window.roomfit.setView('studio'))
})

test('AC-40 focusing a room frames it, and the room chips do the same', async ({ page }) => {
  await page.evaluate(() => window.roomfit.focusZone('bedroom'))
  const camera = await page.evaluate(() => window.roomfit.camera())
  expect(await page.evaluate(() => window.roomfit.state().focusedZone)).toBe('bedroom')
  expect(inside('bedroom', camera.target)).toBe(true)
  const whole = Math.hypot(camera.position.x - camera.target.x, camera.position.y - camera.target.y, camera.position.z - camera.target.z)

  await page.getByRole('button', { name: 'Kitchen & dining', exact: true }).click()
  const kitchen = await page.evaluate(() => window.roomfit.camera())
  expect(await page.evaluate(() => window.roomfit.state().focusedZone)).toBe('kitchen')
  expect(inside('kitchen', kitchen.target)).toBe(true)

  await page.evaluate(() => window.roomfit.focusZone(null))
  const house = await page.evaluate(() => window.roomfit.camera())
  expect(await page.evaluate(() => window.roomfit.state().focusedZone)).toBeNull()
  expect(Math.hypot(house.position.x - house.target.x, house.position.y - house.target.y, house.position.z - house.target.z)).toBeGreaterThan(whole)
})

test('AC-41 a new product lands in the focused room against a wall with no problems', async ({ page }) => {
  await page.evaluate(() => window.roomfit.focusZone('office'))
  const outcome = await page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({
    fileName: 'chair.png', imageBase64, name: 'Reading chair', dimensions: { width: 80, depth: 80, height: 90 }
  }), PHOTO)
  if (!outcome.ok) throw new Error(outcome.message)

  const state = await page.evaluate(() => window.roomfit.state())
  const item = state.layout.items.find((candidate) => candidate.id === outcome.itemId)!
  expect(inside('office', item.position)).toBe(true)
  expect(state.outOfBounds).toEqual([])
  expect(state.collisions).toEqual([])
})

test('AC-41 an explicit room wins over the focused one, and a full room is reported', async ({ page }) => {
  await page.evaluate(() => window.roomfit.focusZone('office'))
  const placed = await page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({
    fileName: 'lamp.png', imageBase64, name: 'Lamp', dimensions: { width: 40, depth: 40, height: 150 }, zoneId: 'garage'
  }), PHOTO)
  if (!placed.ok) throw new Error(placed.message)
  const item = (await page.evaluate(() => window.roomfit.state())).layout.items.find((candidate) => candidate.id === placed.itemId)!
  expect(inside('garage', item.position)).toBe(true)

  const before = await page.evaluate(() => window.roomfit.save())
  const tooBig = await page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({
    fileName: 'piano.png', imageBase64, name: 'Grand piano', dimensions: { width: 600, depth: 300, height: 100 }, zoneId: 'bath'
  }), PHOTO)
  expect(tooBig).toMatchObject({ ok: false, reason: 'no-space' })
  expect(await page.evaluate(() => window.roomfit.save())).toEqual(before)
})

test('AC-42 render from a focused room in the studio uses that view', async ({ page }) => {
  await page.evaluate(() => window.roomfit.focusZone('living'))
  const camera = await page.evaluate(() => window.roomfit.camera())
  const outcome = await page.evaluate(() => window.roomfit.renderInComfy({ prompt: 'warm living room', seed: 3, size: { width: 576, height: 448 } }))
  if (!outcome.ok) throw new Error(outcome.message)

  expect(await page.evaluate(() => window.roomfit.camera())).toEqual(camera)
  expect(await page.evaluate(() => window.roomfit.state().view)).toBe('studio')
  await expect(page.getByRole('img', { name: 'Render result' })).toBeVisible()
})

test('AC-44 a focused room is framed from above so the whole room shows', async ({ page }) => {
  for (const id of ['bedroom', 'kitchen', 'garage']) {
    await page.evaluate((zoneId) => window.roomfit.focusZone(zoneId), id)
    const { position, target } = await page.evaluate(() => window.roomfit.camera())
    const elevation = (Math.atan2(position.y - target.y, Math.hypot(position.x - target.x, position.z - target.z)) * 180) / Math.PI
    expect(elevation, id).toBeGreaterThanOrEqual(55)
    expect(elevation, id).toBeLessThanOrEqual(75)
  }
})

test('AC-44 the studio Render button renders the current room with a prompt from the room and the light', async ({ page }) => {
  await page.getByRole('button', { name: 'Living', exact: true }).click()
  await page.getByRole('button', { name: 'Evening', exact: true }).click()
  await page.getByRole('button', { name: 'Render this view' }).click()
  await expect(page.getByRole('img', { name: 'Render result' })).toBeVisible({ timeout: 20_000 })

  const prompts = (await (await fetch('http://127.0.0.1:8199/__requests')).json()) as { method: string; url: string }[]
  expect(prompts.some((request) => request.method === 'POST' && request.url === '/api/prompt')).toBe(true)
  const lastPositive = await page.evaluate(() => window.roomfit.state().jobs.at(-1))
  expect(lastPositive).toMatchObject({ kind: 'render', status: 'done' })
  await expect(page.getByText(/living/i).last()).toBeVisible()
  await expect(page.getByText(/evening/i).last()).toBeVisible()
})
