import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const PRESETS = {
  work: { sunElevationDeg: 55, sunKelvin: 6000, sunIntensity: 3, interiorKelvin: 5000, interiorIntensity: 0.6 },
  reading: { sunElevationDeg: 35, sunKelvin: 4500, sunIntensity: 2, interiorKelvin: 3000, interiorIntensity: 1 },
  movie: { sunElevationDeg: 8, sunKelvin: 3200, sunIntensity: 0.4, interiorKelvin: 2400, interiorIntensity: 0.35 },
  evening: { sunElevationDeg: 4, sunKelvin: 2700, sunIntensity: 0.6, interiorKelvin: 2700, interiorIntensity: 1.4 }
} as const

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
})

test('AC-32 studio view frames the whole house from above at three-quarters', async ({ page }) => {
  await page.evaluate(() => window.roomfit.setView('studio'))
  const { position, target } = await page.evaluate(() => window.roomfit.camera())
  const horizontal = Math.hypot(position.x - target.x, position.z - target.z)
  const elevation = (Math.atan2(position.y - target.y, horizontal) * 180) / Math.PI

  expect(await page.evaluate(() => window.roomfit.state().view)).toBe('studio')
  expect(elevation).toBeGreaterThanOrEqual(30)
  expect(elevation).toBeLessThanOrEqual(65)
  expect(Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z)).toBeGreaterThan(1400)
  await page.screenshot({ path: '.harness/e2e-output/studio-work.png' })
})

test('AC-33 scene presets set the lighting and the bottom bar shows the active one', async ({ page }) => {
  await page.evaluate(() => window.roomfit.setView('studio'))
  for (const [preset, expected] of Object.entries(PRESETS)) {
    await page.getByRole('button', { name: preset[0]!.toUpperCase() + preset.slice(1), exact: true }).click()
    const lighting = await page.evaluate(() => window.roomfit.lighting())
    expect(lighting).toMatchObject({ preset, ...expected })
    expect(await page.evaluate(() => window.roomfit.state().scene)).toBe(preset)
    await expect(page.getByRole('button', { name: preset[0]!.toUpperCase() + preset.slice(1), exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
})

test('AC-33 evening is visibly darker outside than work', async ({ page }) => {
  await page.evaluate(() => window.roomfit.setView('studio'))
  const luminance = async (preset: 'work' | 'evening') => {
    await page.evaluate((p) => window.roomfit.setScene(p), preset)
    await page.waitForTimeout(400)
    const shot = await page.locator('canvas').first().screenshot({ path: `.harness/e2e-output/studio-${preset}.png` })
    return page.evaluate(async (base64) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data
      let sum = 0
      for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!
      return sum / (data.length / 4)
    }, shot.toString('base64'))
  }
  const work = await luminance('work')
  const evening = await luminance('evening')

  expect(evening).toBeLessThan(work * 0.85)
})

test('AC-34 the studio needs nothing from the network', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => { if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(request.url())) external.push(request.url()) })
  await page.reload()
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  await page.evaluate(() => window.roomfit.setView('studio'))
  await page.getByRole('button', { name: 'Evening', exact: true }).click()
  await page.waitForTimeout(800)

  expect(external).toEqual([])
})
