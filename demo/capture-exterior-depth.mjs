import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
const [layoutPath, out] = process.argv.slice(2)
const layout = JSON.parse(readFileSync(layoutPath, 'utf8')).layout
const browser = await chromium.launch({ args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const uploads = []
await page.route('**/upload/image', async (route) => { uploads.push(route.request().postDataBuffer()); await route.continue() })
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.evaluate(() => window.roomfit.setView('studio'))
await page.waitForTimeout(1000)
for (const view of ['aerial', 'street']) {
  const before = uploads.length
  const shot = await page.evaluate((v) => window.roomfit.exteriorShot(v), view)
  console.log(view, JSON.stringify(shot))
  await page.evaluate((v) => window.roomfit.renderExterior(v), view)
  const body = uploads.slice(before).find(Boolean)
  const start = body.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  writeFileSync(`${out}-${view}.png`, body.subarray(start))
}
await browser.close()
