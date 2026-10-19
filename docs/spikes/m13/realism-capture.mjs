import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const out = 'demo/out/realism'
const layout = JSON.parse(readFileSync('demo/out/agent/final-state.json', 'utf8')).layout
const browser = await chromium.launch({ args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1152, height: 896 } })
const uploads = []
await page.route('**/upload/image', async (route) => { uploads.push(route.request().postDataBuffer()); await route.continue() })
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.setScene('evening'); window.roomfit.focusZone('living') })
await page.waitForTimeout(1500)
const outcome = await page.evaluate(() => window.roomfit.renderInComfy({ prompt: 'Photograph of the living of a bright modern home, evening light, photorealistic interior, natural materials, soft shadows', seed: 21, size: { width: 1152, height: 896 } }))
const depth = uploads.at(-1)
writeFileSync(`${out}/depth.bin`, depth)
const bytes = await page.evaluate(async (url) => { const b = new Uint8Array(await (await fetch(url)).arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s) }, outcome.image)
writeFileSync(`${out}/A-current.png`, Buffer.from(bytes, 'base64'))
await page.keyboard.press('Escape')
const camera = await page.evaluate(() => window.roomfit.state().lastRenderCamera)
await page.evaluate((pose) => { window.roomfit.focusZone(null); window.roomfit.setCamera(pose) }, camera)
await page.waitForTimeout(1500)
await page.locator('canvas').first().screenshot({ path: `${out}/studio-color.png` })
const items = await page.evaluate(() => { const s = window.roomfit.state(); return s.layout.items.filter((i) => i.position.x > -700 && i.position.x < 0 && i.position.z > 0).map((i) => s.layout.assets.find((a) => a.id === i.assetId)?.name) })
writeFileSync(`${out}/living-items.json`, JSON.stringify({ items, camera }, null, 2))
await browser.close()
console.log(items)
