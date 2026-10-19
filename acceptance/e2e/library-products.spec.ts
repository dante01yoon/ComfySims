import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const SOFA_URL = 'https://store.example/p/grey-sofa-200/'
const library = (page: Page) => page.getByRole('region', { name: 'Library' })
const row = (page: Page, name: string) => library(page).getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })

async function bigPhoto(page: Page) {
  return page.evaluate(async () => {
    const canvas = new OffscreenCanvas(1600, 1200)
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(1600, 1200)
    for (let i = 0; i < pixels.data.length; i++) pixels.data[i] = (i * 2654435761) % 256
    context.putImageData(pixels, 0, 0)
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  })
}

async function addSofa(page: Page, overrides: Record<string, unknown> = {}) {
  const imageBase64 = await bigPhoto(page)
  const outcome = await page.evaluate((request) => window.roomfit.addProductFromPhoto(request), {
    fileName: 'sofa.png', imageBase64, name: 'Grey sofa', dimensions: { width: 200, depth: 90, height: 85 }, zoneId: 'living',
    productUrl: SOFA_URL, brand: 'IKEA', store: 'IKEA Korea', labels: ['living', 'shortlist'], ...overrides
  })
  if (!outcome.ok) throw new Error(outcome.message)
  return outcome
}

test.beforeEach(async ({ page }) => {
  await page.context().route('https://store.example/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Grey sofa</title>' }))
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  await page.evaluate(() => window.roomfit.setView('studio'))
})

test('AC-78 a product added with link, brand, store and labels keeps them and a small photo thumbnail', async ({ page }) => {
  const outcome = await addSofa(page)
  const state = await page.evaluate(() => window.roomfit.state())
  const item = state.layout.items.find((entry) => entry.id === outcome.itemId)!
  const asset = state.layout.assets.find((entry) => entry.id === item.assetId)!
  const uploaded = ((await (await fetch('http://127.0.0.1:8199/__prompts')).json()) as { images: string[] }[]).at(-1)!.images

  expect(asset.product).toMatchObject({ url: SOFA_URL, brand: 'IKEA', store: 'IKEA Korea' })
  expect(asset.labels).toEqual(['living', 'shortlist'])
  expect(asset.product?.photo?.thumbnail).toMatch(/^data:image\/(jpeg|png|webp);base64,/)
  expect(asset.product!.photo!.thumbnail.length).toBeLessThanOrEqual(56_000)
  expect(uploaded).toContain(asset.product?.photo?.comfyInputName)
})

test('AC-78 the add-product form takes link, brand, store and labels, and refuses a non-web link', async ({ page }) => {
  await page.evaluate(() => window.roomfit.setView('editor'))
  const link = page.getByLabel('Product link')
  await link.fill('ftp://example.com/sofa')
  await expect(page.getByText('Enter a web address starting with https://')).toBeVisible()
  await page.getByLabel('Product photo').setInputFiles({ name: 'sofa.png', mimeType: 'image/png', buffer: Buffer.from(await bigPhoto(page), 'base64') })
  await page.getByLabel('Product name').fill('Form sofa')
  await page.getByLabel('Width (cm)').fill('200')
  await page.getByLabel('Depth (cm)').fill('90')
  await page.getByLabel('Height (cm)').fill('85')
  await expect(page.getByRole('button', { name: 'Generate 3D' })).toBeDisabled()

  await link.fill(SOFA_URL)
  await page.getByLabel('Brand').fill('IKEA')
  await page.getByLabel('Store').fill('IKEA Korea')
  await page.getByLabel('Labels').fill('living')
  await page.getByLabel('Labels').press('Enter')
  await page.getByRole('button', { name: 'Generate 3D' }).click()
  await expect.poll(async () => (await page.evaluate(() => window.roomfit.state().layout.assets)).find((asset) => asset.name === 'Form sofa')?.product?.url, { timeout: 15_000 }).toBe(SOFA_URL)
  const asset = (await page.evaluate(() => window.roomfit.state().layout.assets)).find((entry) => entry.name === 'Form sofa')!
  expect(asset.product).toMatchObject({ brand: 'IKEA', store: 'IKEA Korea' })
  expect(asset.labels).toEqual(['living'])
})

test('AC-79 library rows and the selected item show the product, and the link opens the store in a new tab', async ({ page }) => {
  const outcome = await addSofa(page)
  const sofa = row(page, 'Grey sofa')
  await expect(sofa).toContainText('IKEA · IKEA Korea')
  await expect(sofa.getByRole('img').first()).toHaveAttribute('src', /^data:image\//)
  const link = sofa.getByRole('link', { name: 'Open product page' })
  await expect(link).toHaveAttribute('href', SOFA_URL)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
  await expect(row(page, 'Three-seat sofa')).toContainText('AI-generated photo · no store')
  await expect(row(page, 'Three-seat sofa').getByRole('link', { name: 'Open product page' })).toHaveCount(0)

  await page.evaluate((itemId) => window.roomfit.selectItem(itemId), outcome.itemId)
  const studioCard = page.getByRole('region', { name: 'Selected item' })
  await expect(studioCard).toContainText('Grey sofa')
  await expect(studioCard).toContainText('IKEA · IKEA Korea')
  const popup = page.waitForEvent('popup')
  await studioCard.getByRole('link', { name: 'Open product page' }).click()
  expect((await popup).url()).toBe(SOFA_URL)

  await page.evaluate(() => window.roomfit.setView('editor'))
  await page.evaluate((itemId) => window.roomfit.selectItem(itemId), outcome.itemId)
  await expect(page.getByRole('region', { name: 'Selected' }).getByRole('link', { name: 'Open product page' })).toHaveAttribute('href', SOFA_URL)
})

test('AC-80 labels are edited from the library and the selected item, undoably, and the library filters by label', async ({ page }) => {
  const outcome = await addSofa(page, { labels: [] })
  const sofa = row(page, 'Grey sofa')
  await sofa.getByRole('button', { name: 'Edit labels' }).click()
  await sofa.getByLabel('Add label').fill('shortlist')
  await sofa.getByLabel('Add label').press('Enter')
  await sofa.getByLabel('Add label').fill('Living wall')
  await sofa.getByLabel('Add label').press('Enter')
  await expect(sofa).toContainText('shortlist')
  const assetId = (await page.evaluate(() => window.roomfit.state().layout.assets)).find((asset) => asset.name === 'Grey sofa')!.id
  const labelsOf = () => page.evaluate((id) => window.roomfit.state().layout.assets.find((asset) => asset.id === id)?.labels ?? [], assetId)
  expect(await labelsOf()).toEqual(['shortlist', 'Living wall'])

  await sofa.getByRole('button', { name: 'Remove label shortlist' }).click()
  expect(await labelsOf()).toEqual(['Living wall'])
  await page.evaluate(() => window.roomfit.undo())
  expect(await labelsOf()).toEqual(['shortlist', 'Living wall'])

  const armchair = house.assets.find((asset) => asset.name === 'Armchair')!
  expect(await page.evaluate((id) => window.roomfit.setAssetLabels(id, ['shortlist']), armchair.id)).toEqual({ ok: true })
  expect((await page.evaluate((id) => window.roomfit.setAssetLabels(id, ['a', 'A']), armchair.id)).ok).toBe(false)

  const filter = library(page).getByLabel('Filter by label')
  await filter.selectOption('shortlist')
  expect(await page.evaluate(() => window.roomfit.state().libraryFilter)).toBe('shortlist')
  await expect(library(page).getByRole('listitem')).toHaveCount(2)

  await page.evaluate((itemId) => window.roomfit.selectItem(itemId), outcome.itemId)
  const card = page.getByRole('region', { name: 'Selected item' })
  await card.getByRole('button', { name: 'Edit labels' }).click()
  await card.getByRole('button', { name: 'Remove label shortlist' }).click()
  expect(await labelsOf()).toEqual(['Living wall'])
  await expect(library(page).getByRole('listitem')).toHaveCount(1)

  await page.evaluate((id) => window.roomfit.setAssetLabels(id, []), armchair.id)
  expect(await page.evaluate(() => window.roomfit.state().libraryFilter)).toBeNull()
  await expect(library(page).getByRole('listitem')).toHaveCount(house.assets.length + 1)
})
