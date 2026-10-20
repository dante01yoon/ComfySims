import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const fixture: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/living-room.json', 'utf8'))
const servedFixture: RoomLayout = {
  ...fixture,
  assets: fixture.assets.map((asset) => ({ ...asset, uri: `/${asset.uri}` }))
}
const withTable: RoomLayout = {
  ...servedFixture,
  assets: [
    ...servedFixture.assets,
    {
      id: 'asset-table',
      name: 'Coffee table',
      uri: '/fixtures/glb/missing-table.glb',
      dimensions: { width: 100, depth: 50, height: 40 },
      source: { kind: 'upload' }
    }
  ],
  items: [
    ...servedFixture.items,
    { id: 'item-table', assetId: 'asset-table', position: { x: 0, y: 0, z: 20 }, rotationY: 0 }
  ]
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
})

test('AC-14 loads a layout and places each item at its listed size and position', async ({ page }) => {
  const loaded = await page.evaluate((layout) => window.roomfit.load(layout), withTable)
  expect(loaded).toEqual({ ok: true })

  const items = await page.evaluate(() => window.roomfit.scene())
  const sofa = items.find((item) => item.id === 'item-sofa')!
  const table = items.find((item) => item.id === 'item-table')!

  expect(sofa.meshLoaded).toBe(true)
  expect(table.meshLoaded).toBe(false)
  for (const [item, min, max] of [
    [sofa, { x: -100, y: 0, z: -170 }, { x: 100, y: 85, z: -80 }],
    [table, { x: -50, y: 0, z: -5 }, { x: 50, y: 40, z: 45 }]
  ] as const) {
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(Math.abs(item.worldBoundsCm.min[axis] - min[axis])).toBeLessThanOrEqual(1)
      expect(Math.abs(item.worldBoundsCm.max[axis] - max[axis])).toBeLessThanOrEqual(1)
    }
  }
})

test('AC-14 rejects an invalid layout with the failing path and keeps the current one', async ({ page }) => {
  await page.evaluate((layout) => window.roomfit.load(layout), servedFixture)
  const broken = { ...servedFixture, items: [{ ...servedFixture.items[0]!, assetId: 'nope' }] }

  const loaded = await page.evaluate((layout) => window.roomfit.load(layout), broken)

  expect(loaded.ok).toBe(false)
  expect(loaded.ok ? [] : loaded.issues.map((issue) => issue.path)).toContain('items.0.assetId')
  expect(await page.evaluate(() => window.roomfit.save())).toEqual(servedFixture)
})

test('AC-15 moving and rotating snap, and collisions follow the listed footprints', async ({ page }) => {
  await page.evaluate((layout) => window.roomfit.load(layout), withTable)
  expect(await page.evaluate(() => window.roomfit.state().collisions)).toEqual([])

  await page.evaluate(() => window.roomfit.moveItem('item-table', { x: 3.4, z: -101.2 }))
  const colliding = await page.evaluate(() => window.roomfit.state())
  expect(colliding.layout.items.find((item) => item.id === 'item-table')!.position).toEqual({ x: 5, y: 0, z: -100 })
  expect(colliding.collisions).toEqual([{ a: 'item-sofa', b: 'item-table' }])
  const highlighted = await page.evaluate(() => window.roomfit.scene())
  expect(highlighted.filter((item) => item.highlighted).map((item) => item.id).sort()).toEqual(['item-sofa', 'item-table'])

  await page.evaluate(() => window.roomfit.rotateItem('item-sofa', 97))
  const rotated = await page.evaluate(() => window.roomfit.state())
  expect(rotated.layout.items.find((item) => item.id === 'item-sofa')!.rotationY).toBe(90)
})

test('AC-15 an item pushed through the wall is reported out of bounds', async ({ page }) => {
  await page.evaluate((layout) => window.roomfit.load(layout), servedFixture)

  await page.evaluate(() => window.roomfit.moveItem('item-sofa', { x: 150, z: 0 }))

  expect(await page.evaluate(() => window.roomfit.state().outOfBounds)).toEqual([{ itemId: 'item-sofa', reason: 'outside-room' }])
})

test('AC-16 save returns the edited layout and it passes the layout contract', async ({ page }) => {
  await page.evaluate((layout) => window.roomfit.load(layout), withTable)
  await page.evaluate(() => {
    window.roomfit.moveItem('item-table', { x: 40, z: 60 })
    window.roomfit.removeItem('item-sofa')
  })

  const saved = await page.evaluate(() => window.roomfit.save())

  expect(saved).toEqual({
    ...withTable,
    items: [{ id: 'item-table', assetId: 'asset-table', position: { x: 40, y: 0, z: 60 }, rotationY: 0 }]
  })
})

test('AC-17 undo and redo walk through moves, rotations and removals', async ({ page }) => {
  await page.evaluate((layout) => window.roomfit.load(layout), withTable)
  await page.evaluate(() => {
    window.roomfit.moveItem('item-table', { x: 40, z: 60 })
    window.roomfit.rotateItem('item-table', 45)
    window.roomfit.removeItem('item-sofa')
  })

  await page.evaluate(() => { window.roomfit.undo(); window.roomfit.undo() })
  const afterUndo = await page.evaluate(() => window.roomfit.state())
  expect(afterUndo.layout.items.map((item) => item.id)).toEqual(['item-sofa', 'item-table'])
  expect(afterUndo.layout.items[1]!.rotationY).toBe(0)
  expect(afterUndo.layout.items[1]!.position).toEqual({ x: 40, y: 0, z: 60 })
  expect(afterUndo.canRedo).toBe(true)

  await page.evaluate(() => window.roomfit.redo())
  expect((await page.evaluate(() => window.roomfit.state())).layout.items[1]!.rotationY).toBe(45)

  await page.evaluate(() => { window.roomfit.undo(); window.roomfit.undo(); window.roomfit.undo() })
  const atStart = await page.evaluate(() => window.roomfit.state())
  const withoutThumbnails = (layout: RoomLayout) => ({ ...layout, assets: layout.assets.map(({ thumbnail: _thumbnail, ...asset }) => asset) })
  expect(withoutThumbnails(atStart.layout)).toEqual(withoutThumbnails(withTable))
  expect(atStart.canUndo).toBe(false)

  await page.evaluate(() => window.roomfit.moveItem('item-sofa', { x: 0, z: 0 }))
  expect((await page.evaluate(() => window.roomfit.state())).canRedo).toBe(false)
})

test('AC-9 exports depth, normal and object-mask passes from a top-down camera', async ({ page }) => {
  await page.evaluate((layout) => window.roomfit.load(layout), servedFixture)
  await page.evaluate(() => {
    window.roomfit.moveItem('item-sofa', { x: 0, z: 0 })
    window.roomfit.setCamera({ position: { x: 0, y: 600, z: 0.01 }, target: { x: 0, y: 0, z: 0 } })
  })

  const pixels = await page.evaluate(async () => {
    const passes = await window.roomfit.exportPasses({ width: 256, height: 192 })
    const read = async (dataUrl: string) => {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      const at = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3))
      return { width: bitmap.width, height: bitmap.height, center: at(128, 96), floor: at(83, 96) }
    }
    return {
      depth: await read(passes.depth),
      normal: await read(passes.normal),
      mask: await read(passes.mask),
      types: [passes.depth, passes.normal, passes.mask].map((url) => url.slice(0, 22))
    }
  })

  expect(pixels.types).toEqual(Array(3).fill('data:image/png;base64,'))
  for (const pass of [pixels.depth, pixels.normal, pixels.mask]) {
    expect([pass.width, pass.height]).toEqual([256, 192])
  }
  expect(pixels.mask.center).toEqual([255, 255, 255])
  expect(pixels.mask.floor).toEqual([0, 0, 0])
  expect(pixels.depth.center[0]!).toBeGreaterThan(pixels.depth.floor[0]! + 20)
  pixels.normal.floor.forEach((channel, index) => expect(Math.abs(channel - [128, 128, 255][index]!)).toBeLessThanOrEqual(8))
})
