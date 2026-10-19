import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const [layoutPath, out = 'demo/out/exterior-check'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const layout = JSON.parse(readFileSync(layoutPath, 'utf8'))
const browser = await chromium.launch({ args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
await page.evaluate((value) => window.roomfit.load(value), layout.layout ?? layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => window.roomfit.setView('studio'))
for (const view of ['aerial', 'street']) {
  const started = Date.now()
  const outcome = await page.evaluate((v) => window.roomfit.renderExterior(v), view)
  if (!outcome.ok) { console.log(view, outcome); continue }
  const bytes = await page.evaluate(async (url) => { const b = new Uint8Array(await (await fetch(url)).arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s) }, outcome.image)
  writeFileSync(`${out}/${view}.png`, Buffer.from(bytes, 'base64'))
  console.log(view, (Date.now() - started) / 1000, 's')
  await page.keyboard.press('Escape')
}
await browser.close()
