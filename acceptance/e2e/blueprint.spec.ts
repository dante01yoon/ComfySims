import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const BLUEPRINT = `data:image/png;base64,${readFileSync('fixtures/blueprints/synthetic-house.png').toString('base64')}`
const jobs = (page: Page) => page.getByRole('region', { name: 'Jobs' })
const boundsOf = (page: Page, id: string) => page.evaluate(async (wanted) => (await window.roomfit.scene()).find((item) => item.id === wanted)?.worldBoundsCm ?? null, id)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  await page.evaluate(() => window.roomfit.setView('studio'))
  await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
})

test('AC-85 the studio draws the site: default lot and trees, then a custom one', async ({ page }) => {
  expect(await page.evaluate(() => window.roomfit.state().site)).toMatchObject({ ground: 'grass', path: [{ x: -225, z: 500 }, { x: -225, z: 1000 }] })
  const lot = await boundsOf(page, 'site-lot')
  expect([lot!.min.x, lot!.min.z, lot!.max.x, lot!.max.z]).toEqual([-1200, -1000, 1200, 1000])

  const site = { lot: [{ x: -900, z: -700 }, { x: 1100, z: -700 }, { x: 1100, z: 1300 }, { x: -900, z: 1300 }], ground: 'gravel' as const, trees: [{ x: 1000, z: 1200 }, { x: -850, z: 1200 }, { x: 1000, z: -650 }] }
  expect(await page.evaluate((value) => window.roomfit.setSite(value), site)).toEqual({ ok: true })
  const custom = await boundsOf(page, 'site-lot')
  expect([custom!.min.x, custom!.min.z, custom!.max.x, custom!.max.z]).toEqual([-900, -700, 1100, 1300])
  const trees = (await page.evaluate(async () => (await window.roomfit.scene()).map((item) => item.id))).filter((id) => id.startsWith('site-tree-'))
  expect(trees.sort()).toEqual(['site-tree-0', 'site-tree-1', 'site-tree-2'])
  const tree = await boundsOf(page, 'site-tree-1')
  expect((tree!.min.x + tree!.max.x) / 2).toBeCloseTo(-850, 0)

  const outside = await page.evaluate((value) => window.roomfit.setSite(value), { ...site, lot: [{ x: -100, z: -100 }, { x: 100, z: -100 }, { x: 100, z: 100 }] })
  expect(outside.ok).toBe(false)
  expect(await page.evaluate(() => window.roomfit.state().site.ground)).toBe('gravel')
})

test('AC-86 the blueprint underlay is drawn where its scale and origin put it, with adjustable opacity, and is saved', async ({ page }) => {
  const blueprint = { image: BLUEPRINT, cmPerPixel: 1 / 0.9, origin: { x: -700 - 160 / 0.9, z: -500 - 160 / 0.9 } }
  expect(await page.evaluate((value) => window.roomfit.setBlueprint(value), blueprint)).toEqual({ ok: true })
  const bounds = await boundsOf(page, 'blueprint')
  expect(bounds!.min.x).toBeCloseTo(blueprint.origin.x, 0)
  expect(bounds!.min.z).toBeCloseTo(blueprint.origin.z, 0)
  expect(bounds!.max.x).toBeCloseTo(blueprint.origin.x + 1580 / 0.9, 0)
  expect(bounds!.max.z).toBeCloseTo(blueprint.origin.z + 1220 / 0.9, 0)

  expect(await page.evaluate(() => window.roomfit.state().blueprintOpacity)).toBe(50)
  await page.evaluate(() => window.roomfit.setView('editor'))
  await page.getByRole('slider', { name: 'Opacity' }).fill('80')
  expect(await page.evaluate(() => window.roomfit.state().blueprintOpacity)).toBe(80)

  const saved = await page.evaluate(() => window.roomfit.save())
  expect(saved.blueprint?.cmPerPixel).toBeCloseTo(1 / 0.9, 6)
  await page.evaluate((layout) => window.roomfit.load(layout), { ...house })
  expect(await boundsOf(page, 'blueprint')).toBeNull()
  await page.evaluate((layout) => window.roomfit.load(layout), saved)
  expect(await boundsOf(page, 'blueprint')).not.toBeNull()
  expect((await page.evaluate((value) => window.roomfit.setBlueprint(value), { ...blueprint, cmPerPixel: 0 })).ok).toBe(false)
})

type Shot = { camera: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fovDeg: number; aspect: number }; roof: { topCm: number }; depthRange: { nearCm: number; farCm: number }; trees: boolean }

function project(shot: Shot, point: { x: number; y: number; z: number }) {
  const { position: eye, target } = shot.camera
  const f = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z }
  const fl = Math.hypot(f.x, f.y, f.z)
  const fw = { x: f.x / fl, y: f.y / fl, z: f.z / fl }
  const right = { x: -fw.z, y: 0, z: fw.x }
  const rl = Math.hypot(right.x, right.z)
  const rt = { x: right.x / rl, y: 0, z: right.z / rl }
  const up = { x: rt.y * fw.z - rt.z * fw.y, y: rt.z * fw.x - rt.x * fw.z, z: rt.x * fw.y - rt.y * fw.x }
  const d = { x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z }
  const depth = d.x * fw.x + d.y * fw.y + d.z * fw.z
  const tan = Math.tan((shot.camera.fovDeg * Math.PI) / 360)
  return { x: (d.x * rt.x + d.z * rt.z) / (depth * tan * shot.camera.aspect), y: (d.x * up.x + d.y * up.y + d.z * up.z) / (depth * tan) }
}

const houseCorners = (top: number) => [-700, 700].flatMap((x) => [-500, 500].flatMap((z) => [0, top].map((y) => ({ x, y, z }))))

test('AC-87 exterior shots frame the house, read as a house from the street, end the depth at the lot, and render through ComfyUI', async ({ page }) => {
  const aerial = (await page.evaluate(() => window.roomfit.exteriorShot('aerial'))) as unknown as Shot & { roof: { topCm: number; min: unknown; max: unknown } }
  expect(aerial.roof).toEqual({ topCm: 290, min: { x: -700, z: -500 }, max: { x: 700, z: 500 } })
  const dx = aerial.camera.target.x - aerial.camera.position.x
  const dz = aerial.camera.target.z - aerial.camera.position.z
  const pitch = (Math.atan2(aerial.camera.position.y - aerial.camera.target.y, Math.hypot(dx, dz)) * 180) / Math.PI
  expect(pitch).toBeGreaterThanOrEqual(25)
  expect(pitch).toBeLessThanOrEqual(35)
  const aerialPoints = houseCorners(290).map((corner) => project(aerial, corner))
  const spanX = (Math.max(...aerialPoints.map((p) => p.x)) - Math.min(...aerialPoints.map((p) => p.x))) / 2
  const spanY = (Math.max(...aerialPoints.map((p) => p.y)) - Math.min(...aerialPoints.map((p) => p.y))) / 2
  expect(Math.max(spanX, spanY), 'house fills 50–80 % of the frame').toBeGreaterThanOrEqual(0.5)
  expect(Math.max(spanX, spanY)).toBeLessThanOrEqual(0.8)
  expect(aerialPoints.every((p) => Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1), 'whole house in frame').toBe(true)
  const lotCornerDistance = Math.max(...[-1200, 1200].flatMap((x) => [-1000, 1000].map((z) => Math.hypot(x - aerial.camera.position.x, aerial.camera.position.y, z - aerial.camera.position.z))))
  expect(aerial.depthRange.farCm).toBeLessThanOrEqual(lotCornerDistance + 1)
  expect(aerial.depthRange.farCm).toBeGreaterThan(aerial.depthRange.nearCm)
  expect(aerial.trees).toBe(false)

  const street = (await page.evaluate(() => window.roomfit.exteriorShot('street'))) as unknown as Shot
  expect(street.camera.position.y).toBe(160)
  const { x, z } = street.camera.position
  expect((x < -700 || x > 700) && (z < -500 || z > 500), 'street camera diagonal to the house: two façades').toBe(true)
  expect(x >= -1200 && x <= 1200 && z >= -1000 && z <= 1000, 'street camera on the lot').toBe(true)
  expect(street.trees).toBe(false)

  await page.getByRole('button', { name: 'Render exterior' }).click()
  await expect(jobs(page).getByRole('article', { name: 'Exterior render · Aerial' })).toContainText('done', { timeout: 15_000 })
  await expect(jobs(page).getByRole('article', { name: 'Exterior render · Street' })).toContainText('done', { timeout: 15_000 })
  const prompts = (await (await fetch('http://127.0.0.1:8199/__prompts')).json()) as { positive: string | null }[]
  expect(prompts.slice(-2).every((prompt) => /exterior/i.test(prompt.positive ?? '') && /trees/i.test(prompt.positive ?? ''))).toBe(true)
})
