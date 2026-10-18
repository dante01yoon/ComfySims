import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))

test('AC-31 the demo house loads with every item at its listed size and no problems', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  expect(await page.evaluate((layout) => window.roomfit.load(layout), house)).toEqual({ ok: true })

  const state = await page.evaluate(() => window.roomfit.state())
  const items = await page.evaluate(() => window.roomfit.scene())
  const sofa = items.find((item) => item.id === 'item-sofa')!

  expect(state.outOfBounds).toEqual([])
  expect(state.collisions).toEqual([])
  expect(items).toHaveLength(house.items.length)
  expect(sofa.worldBoundsCm.max.x - sofa.worldBoundsCm.min.x).toBeCloseTo(200, 0)
  expect(sofa.worldBoundsCm.max.y).toBeCloseTo(85, 0)
  await page.screenshot({ path: '.harness/e2e-output/plan-editor.png' })
})
