import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const OUT = 'demo/out/m9-spike'
const layout = JSON.parse(readFileSync('demo/out/agent/final-state.json', 'utf8')).layout
const prompt = 'Exterior architectural photograph of a modern single-storey Scandinavian house, flat roof, white render walls, large windows, green lawn, trees, gravel path, clear sky, photorealistic'
const views = {
  aerial: { position: { x: 1300, y: 1250, z: 1500 }, target: { x: 0, y: 0, z: 0 } },
  street: { position: { x: 200, y: 160, z: 1400 }, target: { x: 0, y: 140, z: 0 } }
}
const browser = await chromium.launch({ args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.focusZone(null) })
for (const [name, camera] of Object.entries(views)) {
  await page.evaluate((pose) => window.roomfit.setCamera(pose), camera)
  await page.waitForTimeout(1500)
  const passes = await page.evaluate(() => window.roomfit.exportPasses({ width: 1024, height: 576 }))
  writeFileSync(`${OUT}/${name}-depth.png`, Buffer.from(passes.depth.split(',')[1], 'base64'))
  await page.screenshot({ path: `${OUT}/${name}-studio.png` })
  const started = Date.now()
  const outcome = await page.evaluate((text) => window.roomfit.renderInComfy({ prompt: text, seed: 7, size: { width: 1024, height: 576 } }), prompt)
  if (!outcome.ok) { console.log(name, outcome); continue }
  const bytes = await page.evaluate(async (url) => { const b = new Uint8Array(await (await fetch(url)).arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s) }, outcome.image)
  writeFileSync(`${OUT}/${name}-render.png`, Buffer.from(bytes, 'base64'))
  console.log(name, 'rendered in', (Date.now() - started) / 1000, 's')
  await page.keyboard.press('Escape')
}
await browser.close()
