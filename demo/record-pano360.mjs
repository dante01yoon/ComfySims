import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

const OUT = 'demo/out/pano360'
const layout = JSON.parse(readFileSync('demo/out/agent/final-state.json', 'utf8')).layout
mkdirSync(`${OUT}/video`, { recursive: true })
const started = Date.now()
const marks = []
const mark = (name) => { marks.push({ name, t: (Date.now() - started) / 1000 }); console.log(name, marks.at(-1).t) }
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1600, height: 900 } } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.setScene('reading') })
mark('ready')
await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'Bedroom', exact: true }).click()
mark('bedroom-focused')
await page.waitForTimeout(2500)
const depth = await page.evaluate(() => window.roomfit.depthPanorama('bedroom'))
writeFileSync(`${OUT}/depth.png`, Buffer.from(depth.image.split(',')[1], 'base64'))
await page.getByRole('button', { name: '360° view' }).click()
mark('generate-click')
const viewer = page.getByRole('dialog', { name: '360° view' })
await viewer.waitFor({ timeout: 600_000 })
mark('viewer-open')
const job = await page.evaluate(() => window.roomfit.state().jobs.find((entry) => entry.kind === 'pano360'))
const image = await page.evaluate(async (url) => {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}, job.result.image)
writeFileSync(`${OUT}/panorama.png`, Buffer.from(image, 'base64'))
await page.waitForTimeout(2500)
const box = await viewer.boundingBox()
const drag = async (dx, dy, steps) => {
  const x = box.x + box.width / 2 - dx / 2
  const y = box.y + box.height / 2 - dy / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps })
  await page.mouse.up()
}
mark('look-around')
await drag(-box.width * 0.95, 0, 240)
await drag(-box.width * 0.95, 0, 240)
await drag(0, box.height * 0.2, 40)
await drag(-box.width * 0.25, 0, 80)
mark('zoom')
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(60) }
await page.waitForTimeout(1500)
for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60) }
await page.waitForTimeout(1500)
mark('close')
await viewer.getByRole('button', { name: 'Close' }).click()
await page.waitForTimeout(2500)
mark('end')
writeFileSync(`${OUT}/marks.json`, JSON.stringify({ marks, job }, null, 2))
const video = page.video()
await context.close()
renameSync(await video.path(), `${OUT}/raw.webm`)
await page.context().browser()?.close()
await browser.close()
console.log('recorded')
