import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const lastPrompt = async () => ((await (await fetch('http://127.0.0.1:8199/__prompts')).json()) as { positive: string | null; negative: string | null; savePrefix: string | null }[]).at(-1)!
const jobs = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Jobs' })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.setScene('evening'); window.roomfit.focusZone('bedroom') })
  await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
})

test('AC-101 room renders and the 360° view send the layout-aware prompts', async ({ page }) => {
  expect(await page.evaluate(() => window.roomfit.state().renderStyle)).toBe('lived-in')
  await page.getByRole('button', { name: 'Render this view' }).click()
  await expect(jobs(page).getByRole('article', { name: /^Room render/ }).first()).toContainText('done', { timeout: 15_000 })
  const room = await lastPrompt()
  expect(room.positive).toMatch(/^Photograph of a lived-in bedroom in the warm evening light:/)
  expect(room.positive).toContain('queen bed')
  expect(room.positive).toContain('walnut wood floor')
  expect(room.negative).toContain('white walls')

  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: '360° view' }).click()
  await expect(jobs(page).getByRole('article', { name: '360° view · Bedroom' })).toContainText('done', { timeout: 15_000 })
  const pano = await lastPrompt()
  expect(pano.savePrefix).toBe('roomfit/pano360')
  expect(pano.positive).toMatch(/^equirectangular 360 image, /)
  expect(pano.positive).toContain('wardrobe')
  expect(pano.negative).toContain('sterile')
})

test('AC-102 "Render style" switches to as built, is saved, and changes the next prompt', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Render style' }).selectOption({ label: 'As built' })
  expect(await page.evaluate(() => window.roomfit.state().renderStyle)).toBe('as-built')
  await page.getByRole('button', { name: 'Render this view' }).click()
  await expect(jobs(page).getByRole('article', { name: /^Room render/ }).first()).toContainText('done', { timeout: 15_000 })
  const prompt = await lastPrompt()
  expect(prompt.positive).toMatch(/^Photograph of the bedroom of a bright modern home/)
  expect(prompt.negative).toBe('blurry, distorted')
  expect((await page.evaluate(() => window.roomfit.save())).renderStyle).toBe('as-built')
})
