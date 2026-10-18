import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const emptyHouse: RoomLayout = { ...house, items: [] }
const jobs = (page: Page) => page.getByRole('region', { name: 'Jobs' })
const card = (page: Page, title: string) => jobs(page).getByRole('article', { name: title })
const viewer = (page: Page) => page.getByRole('dialog', { name: '360° view' })

async function open(page: Page, layout: RoomLayout) {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((value) => window.roomfit.load(value), layout)
  await page.evaluate(() => window.roomfit.setView('studio'))
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

async function brightnessRow(page: Page, image: string, pitchDegrees: number) {
  return page.evaluate(async ({ image, pitchDegrees }) => {
    const bitmap = await createImageBitmap(await (await fetch(image)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    const row = Math.round(((90 - pitchDegrees) / 180) * bitmap.height - 0.5)
    const data = context.getImageData(0, row, bitmap.width, 1).data
    return Array.from({ length: bitmap.width }, (_, x) => 0.2126 * data[x * 4]! + 0.7152 * data[x * 4 + 1]! + 0.0722 * data[x * 4 + 2]!)
  }, { image, pitchDegrees })
}

const yawOfColumn = (column: number, width: number) => ((column + 0.5) / width) * 360 - 180
const angleBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
const centreOfNearestRunAround = (row: number[], expectedYaw: number, windowDegrees = 30) => {
  const candidates = row.map((value, column) => ({ value, yaw: yawOfColumn(column, row.length) })).filter(({ yaw }) => angleBetween(yaw, expectedYaw) <= windowDegrees)
  const nearest = Math.max(...candidates.map(({ value }) => value))
  const plateau = candidates.filter(({ value }) => value >= nearest - 0.5)
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const sin = plateau.reduce((sum, { yaw }) => sum + Math.sin(radians(yaw)), 0)
  const cos = plateau.reduce((sum, { yaw }) => sum + Math.cos(radians(yaw)), 0)
  return (Math.atan2(sin, cos) * 180) / Math.PI
}

test.describe('AC-63 depth panorama', () => {
  test('AC-63 an empty room: the nearest wall columns face the walls, openings read as far', async ({ page }) => {
    await open(page, emptyHouse)
    const panorama = await page.evaluate(() => window.roomfit.depthPanorama('bedroom'))
    if (!('image' in panorama)) throw new Error('no panorama')

    expect([panorama.width, panorama.height]).toEqual([2048, 1024])
    expect(panorama.standingPoint).toEqual({ x: -450, z: -250 })
    expect(panorama.eyeHeightCm).toBe(160)

    const belowSills = await brightnessRow(page, panorama.image, -20)
    for (const [wall, yaw] of [['south +Z', 0], ['east +X', 90], ['north -Z', 180], ['west -X', -90]] as const) {
      expect(angleBetween(centreOfNearestRunAround(belowSills, yaw), yaw), wall).toBeLessThanOrEqual(2)
    }
    const eyeLevel = await brightnessRow(page, panorama.image, 0)
    const westWindow = eyeLevel[Math.round(((-90 + 180) / 360) * panorama.width)]!
    const southWall = eyeLevel[Math.round(((0 + 180) / 360) * panorama.width)]!
    expect(westWindow, 'the west window at eye level is far').toBeLessThan(20)
    expect(southWall, 'the south wall at eye level is near').toBeGreaterThan(westWindow + 60)
  })

  test('AC-63 the standing point moves off furniture and stays in the room', async ({ page }) => {
    await open(page, house)
    const panorama = await page.evaluate(() => window.roomfit.depthPanorama('bedroom'))
    if (!('image' in panorama)) throw new Error('no panorama')
    const { x, z } = panorama.standingPoint
    const assets = new Map(house.assets.map((asset) => [asset.id, asset.dimensions]))

    expect(x > -700 && x < -200 && z > -500 && z < 0).toBe(true)
    for (const item of house.items.filter((entry) => entry.position.x > -700 && entry.position.x < -200 && entry.position.z > -500 && entry.position.z < 0)) {
      const size = assets.get(item.assetId)!
      const half = Math.max(size.width, size.depth) / 2
      const clear = Math.abs(x - item.position.x) > half || Math.abs(z - item.position.z) > half
      expect(clear, `standing point clear of ${item.id}`).toBe(true)
    }
    expect(await page.evaluate(() => window.roomfit.depthPanorama('nowhere'))).toEqual({ ok: false, reason: 'unknown-zone' })
  })
})

test('AC-64 "360° view" needs a focused room, then queues the 360° workflow with the depth panorama and opens the result', async ({ page }) => {
  await open(page, house)
  const button = page.getByRole('button', { name: '360° view' })
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute('title', 'Focus a room first')
  expect(await page.evaluate(() => window.roomfit.view360())).toEqual({ ok: false, reason: 'no-room' })

  await page.evaluate(() => window.roomfit.focusZone('bedroom'))
  await expect(button).toBeEnabled()
  await button.click()

  await expect(card(page, '360° view · Bedroom')).toContainText('done', { timeout: 15_000 })
  const prompts = (await (await fetch('http://127.0.0.1:8199/__prompts')).json()) as { images: string[]; savePrefix: string | null; positive: string | null }[]
  const last = prompts.at(-1)!
  expect(last.savePrefix).toBe('roomfit/pano360')
  expect(last.images).toHaveLength(1)
  expect(last.positive).toMatch(/^equirectangular 360 image/)
  expect(last.positive).toContain('Bedroom')
  await expect(viewer(page)).toBeVisible()
})

test('AC-65 the viewer turns freely, clamps pitch and field of view, and closes', async ({ page }) => {
  await open(page, house)
  const outcome = await page.evaluate(() => window.roomfit.view360({ zoneId: 'bedroom' }))
  if (!outcome.ok) throw new Error('view360 failed')
  await expect(viewer(page)).toBeVisible()
  const box = (await viewer(page).boundingBox())!
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

  await page.mouse.move(centre.x - box.width * 0.45, centre.y)
  await page.mouse.down()
  await page.mouse.move(centre.x + box.width * 0.45, centre.y, { steps: 12 })
  await page.mouse.up()
  const turned = (await page.evaluate(() => window.roomfit.state().viewer360))!
  expect(angleBetween(turned.yawDegrees, 0)).toBeGreaterThanOrEqual(150)

  await page.mouse.move(centre.x, centre.y - box.height * 0.45)
  await page.mouse.down()
  await page.mouse.move(centre.x, centre.y + box.height * 0.45, { steps: 12 })
  await page.mouse.move(centre.x, centre.y + box.height * 0.45 + 2000, { steps: 4 })
  await page.mouse.up()
  const tilted = (await page.evaluate(() => window.roomfit.state().viewer360))!
  expect(Math.abs(tilted.pitchDegrees)).toBeGreaterThan(30)
  expect(Math.abs(tilted.pitchDegrees)).toBeLessThanOrEqual(80.001)

  await page.mouse.move(centre.x, centre.y)
  await page.mouse.wheel(0, 5000)
  await expect.poll(async () => (await page.evaluate(() => window.roomfit.state().viewer360))!.fovDegrees).toBe(100)
  await page.mouse.wheel(0, -10000)
  await expect.poll(async () => (await page.evaluate(() => window.roomfit.state().viewer360))!.fovDegrees).toBe(40)

  await viewer(page).getByRole('button', { name: 'Close' }).click()
  expect(await page.evaluate(() => window.roomfit.state().viewer360)).toBeNull()
  await page.evaluate((jobId) => window.roomfit.open360(jobId), outcome.jobId)
  await expect(viewer(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer(page)).toBeHidden()
  expect(await page.evaluate(() => window.roomfit.state().viewer360)).toBeNull()
})

test('AC-66 moving furniture in the room marks its view stale; only Regenerate makes a new one', async ({ page }) => {
  await open(page, house)
  const outcome = await page.evaluate(() => window.roomfit.view360({ zoneId: 'bedroom' }))
  if (!outcome.ok) throw new Error('view360 failed')
  await page.evaluate(() => window.roomfit.close360())

  await page.evaluate(() => window.roomfit.moveItem('item-car', { x: 540, z: 10 }))
  await expect(card(page, '360° view · Bedroom')).not.toContainText('Layout changed since this view')

  await page.evaluate(() => window.roomfit.moveItem('item-nightstand', { x: -600, z: -440 }))
  await expect(card(page, '360° view · Bedroom')).toContainText('Layout changed since this view')
  await page.evaluate((jobId) => window.roomfit.open360(jobId), outcome.jobId)
  expect((await page.evaluate(() => window.roomfit.state().viewer360))?.stale).toBe(true)
  await expect(viewer(page)).toContainText('Layout changed since this view')
  await page.evaluate(() => window.roomfit.close360())

  await page.waitForTimeout(500)
  expect((await page.evaluate(() => window.roomfit.state().jobs)).filter((job) => job.kind === 'pano360')).toHaveLength(1)
  await card(page, '360° view · Bedroom').getByRole('button', { name: 'Regenerate' }).click()
  await expect(jobs(page).getByRole('article', { name: '360° view · Bedroom' })).toHaveCount(2)
})
