import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const [out] = process.argv.slice(2)
const house = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const photo = readFileSync('demo/out/agent/armchair.png').toString('base64')
const browser = await chromium.launch({ args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate((layout) => window.roomfit.load(layout), house)
await page.evaluate(() => window.roomfit.setView('studio'))
const added = await page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({ fileName: 'armchair.png', imageBase64, name: 'Oak lounge chair', dimensions: { width: 68, depth: 78, height: 80 }, zoneId: 'bedroom', productUrl: 'https://store.example/p/oak-lounge-chair', brand: 'Nordic Oak', store: 'Store Example', labels: ['bedroom', 'shortlist'] }), photo)
await page.evaluate((itemId) => { window.roomfit.focusZone('bedroom'); window.roomfit.selectItem(itemId) }, added.itemId)
await page.waitForTimeout(1500)
await page.screenshot({ path: out })
await browser.close()
