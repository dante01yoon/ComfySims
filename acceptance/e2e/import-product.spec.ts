import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const page_ = (file: string) => readFileSync(`fixtures/pages/${file}`, 'utf8')
const IKEA = 'https://www.ikea.com/us/en/p/testvik-sofa-s00000000/'
const AMAZON = 'https://www.amazon.com/dp/B000TEST00'
const LAMP = 'https://lamp-shop.example/p/paper-lamp'

async function openEditor(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
}

async function sendFrom(context: BrowserContext, bookmarklet: string, url: string, html: string) {
  await context.route(url, (route) => route.fulfill({ contentType: 'text/html', body: html }))
  const store = await context.newPage()
  await store.goto(url)
  const opened = context.waitForEvent('page')
  await store.evaluate((code) => { window.location.href = code }, bookmarklet)
  const editor = await opened
  await editor.waitForLoadState()
  return editor
}

const importOf = (editorUrl: string) => JSON.parse(decodeURIComponent(new URL(editorUrl).hash.replace(/^#import=/, '')))

test('AC-104 on a JSON-LD product page the bookmarklet sends name, brand, store, photo and the size in cm', async ({ page, context }) => {
  await openEditor(page)
  const bookmarklet = await page.evaluate(() => window.roomfit.bookmarklet())
  expect(bookmarklet.startsWith('javascript:')).toBe(true)
  const editor = await sendFrom(context, bookmarklet, IKEA, page_('jsonld-product.html'))
  expect(editor.url().startsWith('http://127.0.0.1:5179/')).toBe(true)
  expect(importOf(editor.url())).toEqual({
    url: IKEA, store: 'IKEA', name: 'TESTVIK Sofa - Tibbleby beige/gray', brand: 'IKEA',
    image: 'http://127.0.0.1:8197/signed/testvik-sofa.png', dimensions: { width: 228, depth: 94.9, height: 82.9 }, model3d: 'https://example.invalid/model.glb'
  })
})

test('AC-105 on an Amazon product page it reads the title, brand, high-resolution image and D x W x H', async ({ page, context }) => {
  await openEditor(page)
  const editor = await sendFrom(context, await page.evaluate(() => window.roomfit.bookmarklet()), AMAZON, page_('amazon-product.html'))
  expect(importOf(editor.url())).toMatchObject({
    url: AMAZON, store: 'Amazon', name: 'TESTLA HOME 84" Faux Leather Sofa, Mid Century Modern 3 Seater Couch, Camel', brand: 'TESTLA HOME',
    image: 'http://127.0.0.1:8197/signed/testla-sofa.png', dimensions: { width: 213.4, depth: 83.8, height: 76.2 }
  })
})

test('AC-106 the editor opens with the form filled, the size to check, and generating keeps the product', async ({ page, context }) => {
  await openEditor(page)
  const editor = await sendFrom(context, await page.evaluate(() => window.roomfit.bookmarklet()), IKEA, page_('jsonld-product.html'))
  await editor.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await editor.evaluate(() => window.roomfit.ready())
  await expect(editor.getByText('Imported from IKEA — check the size')).toBeVisible({ timeout: 10_000 })
  await expect(editor.getByLabel('Product name')).toHaveValue('TESTVIK Sofa - Tibbleby beige/gray')
  await expect(editor.getByLabel('Width (cm)')).toHaveValue('228')
  await expect(editor.getByLabel('Depth (cm)')).toHaveValue('94.9')
  await expect(editor.getByLabel('Height (cm)')).toHaveValue('82.9')
  await expect(editor.getByLabel('Product link')).toHaveValue(IKEA)
  await expect(editor.getByLabel('Brand')).toHaveValue('IKEA')
  await expect(editor.getByLabel('Store')).toHaveValue('IKEA')
  expect(new URL(editor.url()).hash).toBe('')
  expect((await editor.evaluate(() => window.roomfit.state().pendingImport))?.name).toBe('TESTVIK Sofa - Tibbleby beige/gray')
  await expect(editor.getByRole('button', { name: 'Generate 3D' })).toBeEnabled({ timeout: 10_000 })
  await editor.getByRole('button', { name: 'Generate 3D' }).click()
  await expect.poll(async () => (await editor.evaluate(() => window.roomfit.state().layout.assets)).find((asset) => asset.name === 'TESTVIK Sofa - Tibbleby beige/gray')?.product, { timeout: 15_000 }).toMatchObject({ url: IKEA, brand: 'IKEA', store: 'IKEA' })
  expect(await editor.evaluate(() => window.roomfit.state().pendingImport)).toBeNull()

  const lamp = await sendFrom(context, await page.evaluate(() => window.roomfit.bookmarklet()), LAMP, page_('no-size-product.html'))
  await expect(lamp.getByText('Imported from Lamp Shop — the page has no size; enter it from the listing')).toBeVisible({ timeout: 10_000 })
  await expect(lamp.getByLabel('Product name')).toHaveValue('Paper floor lamp')
  await expect(lamp.getByLabel('Width (cm)')).toHaveValue('')
})

test('AC-107 the photo fetch accepts images only, from the editor only', async ({ page }) => {
  await openEditor(page)
  const fromEditor = await page.evaluate(async () => {
    const ask = async (url: string) => (await fetch(`/__roomfit/fetch-image?url=${encodeURIComponent(url)}`)).status
    return { image: await ask('http://127.0.0.1:8197/signed/x.png'), json: await ask('http://127.0.0.1:8199/__requests'), file: await ask('file:///etc/passwd') }
  })
  expect(fromEditor).toEqual({ image: 200, json: 415, file: 400 })
  const foreign = await fetch(`http://127.0.0.1:5179/__roomfit/fetch-image?url=${encodeURIComponent('http://127.0.0.1:8197/signed/x.png')}`, { headers: { Origin: 'http://evil.example' } })
  expect(foreign.status).toBe(403)
})
