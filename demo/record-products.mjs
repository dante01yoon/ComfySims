import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

const OUT = 'demo/out/products-run'
const LABEL = 'living-wall candidates'
const photo = (file) => readFileSync(`demo/out/products/${file}`).toString('base64')
const products = [
  { file: 'hulala-84-white.jpg', name: 'HULALA HOME 84" faux leather sofa', dimensions: { width: 213.4, depth: 83.8, height: 76.2 }, productUrl: 'https://www.amazon.com/dp/B0C2P3KPTM', brand: 'HULALA HOME', store: 'Amazon' },
  { file: 'baxton-sorrento.jpg', name: 'Baxton Studio Sorrento sofa', dimensions: { width: 181, depth: 75.5, height: 84.5 }, productUrl: 'https://www.amazon.com/dp/B019516ZP8', brand: 'Baxton Studio', store: 'Amazon' },
  { file: 'dopedio-71.jpg', name: 'DOPEDIO 71" chenille loveseat', dimensions: { width: 181, depth: 82, height: 93 }, productUrl: 'https://www.amazon.com/dp/B0CTBJB53S', brand: 'DOPEDIO', store: 'Amazon' }
]
const layout = JSON.parse(readFileSync('demo/out/agent/final-state.json', 'utf8')).layout
layout.items = layout.items.filter((item) => item.id !== 'item-sofa')
mkdirSync(`${OUT}/video`, { recursive: true })
const started = Date.now()
const marks = []
const mark = (name, extra = {}) => { marks.push({ name, t: (Date.now() - started) / 1000, ...extra }); console.log(name, marks.at(-1).t) }
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1600, height: 900 } } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => { window.roomfit.setScene('reading'); window.roomfit.setView('editor'); window.roomfit.focusZone('garage') })
mark('ready')
await page.waitForTimeout(1500)

const [first, ...rest] = products
await page.getByLabel('Product photo').setInputFiles(`demo/out/products/${first.file}`)
const type = async (label, text) => { await page.getByLabel(label).click(); await page.getByLabel(label).fill(''); await page.getByLabel(label).pressSequentially(String(text), { delay: 25 }) }
await type('Product name', first.name)
await type('Width (cm)', first.dimensions.width)
await type('Depth (cm)', first.dimensions.depth)
await type('Height (cm)', first.dimensions.height)
await type('Product link', first.productUrl)
await type('Brand', first.brand)
await type('Store', first.store)
await type('Labels', LABEL)
await page.getByLabel('Labels').press('Enter')
await page.waitForTimeout(800)
await page.getByRole('button', { name: 'Generate 3D' }).click()
mark('form-submitted')
const others = rest.map((product) => page.evaluate((request) => window.roomfit.addProductFromPhoto(request), {
  fileName: product.file, imageBase64: photo(product.file), name: product.name, dimensions: product.dimensions, zoneId: 'garage',
  productUrl: product.productUrl, brand: product.brand, store: product.store, labels: [LABEL]
}))
await page.waitForTimeout(1500)
await page.evaluate(() => window.roomfit.setView('studio'))
mark('generating')
const outcomes = await Promise.all(others)
await page.waitForFunction((count) => window.roomfit.state().jobs.filter((job) => job.kind === 'product' && job.steps.at(-1)?.status === 'done').length >= count, 3, { timeout: 900_000 })
mark('all-done', { outcomes: outcomes.map((outcome) => outcome.ok ? outcome.report : outcome) })
await page.waitForTimeout(3000)

await page.getByRole('region', { name: 'Library' }).getByLabel('Filter by label').selectOption(LABEL)
mark('filtered')
await page.waitForTimeout(3500)
const chosen = (await page.evaluate(() => window.roomfit.state().layout.assets)).find((asset) => asset.name === first.name)
const placed = await page.evaluate((assetId) => window.roomfit.placeAsset(assetId, 'living'), chosen.id)
await page.evaluate(() => window.roomfit.focusZone('living'))
mark('placed-living', { placed })
await page.waitForTimeout(3000)
await page.evaluate((itemId) => window.roomfit.selectItem(itemId), placed.itemId)
await page.waitForTimeout(3000)
const popupPromise = context.waitForEvent('page')
await page.getByRole('region', { name: 'Selected item' }).getByRole('link', { name: 'Open product page' }).click()
const popup = await popupPromise
mark('store-opened')
await popup.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {})
await popup.waitForTimeout(5000)
await popup.screenshot({ path: `${OUT}/store.png` })
mark('store-shot', { url: popup.url() })
await popup.close()
await page.waitForTimeout(2000)
mark('end', { assets: (await page.evaluate(() => window.roomfit.state().layout.assets)).filter((asset) => asset.labels?.length).map(({ name, product, labels, fit, dimensions }) => ({ name, url: product?.url, labels, fit, dimensions })) })
writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 2))
const video = page.video()
await context.close()
renameSync(await video.path(), `${OUT}/raw.webm`)
await browser.close()
console.log('recorded')
