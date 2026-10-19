import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

const OUT = 'demo/out/drag'
const layout = JSON.parse(readFileSync('demo/out/agent/final-state.json', 'utf8')).layout
mkdirSync(`${OUT}/video`, { recursive: true })
const started = Date.now()
const marks = []
const mark = (name, extra = {}) => { marks.push({ name, t: (Date.now() - started) / 1000, ...extra }); console.log(name, marks.at(-1).t, JSON.stringify(extra).slice(0, 200)) }
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1600, height: 900 } } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => { window.roomfit.setScene('reading'); window.roomfit.setView('editor'); window.roomfit.focusZone('living') })
mark('ready')
await page.waitForTimeout(1500)
const type = async (label, text) => { await page.getByLabel(label).click(); await page.getByLabel(label).fill(''); await page.getByLabel(label).pressSequentially(String(text), { delay: 25 }) }
await page.getByLabel('Product photo').setInputFiles('demo/out/agent/armchair.png')
await type('Product name', 'Oak reading chair')
await type('Width (cm)', 68)
await type('Depth (cm)', 78)
await type('Height (cm)', 80)
await type('Labels', 'living')
await page.getByLabel('Labels').press('Enter')
await page.waitForTimeout(600)
await page.evaluate(() => window.roomfit.setView('studio'))
await page.waitForTimeout(2500)
const canvas = page.locator('canvas').first()
const before = (await canvas.screenshot()).toString('base64')
await page.evaluate(() => window.roomfit.setView('editor'))
await page.getByRole('button', { name: 'Generate 3D' }).click()
mark('generate')
await page.waitForTimeout(800)
await page.evaluate(() => window.roomfit.setView('studio'))
await page.waitForFunction(() => window.roomfit.state().jobs.some((job) => job.kind === 'product' && job.steps.at(-1)?.status === 'done'), null, { timeout: 600_000 })
const job = await page.evaluate(() => window.roomfit.state().jobs.find((entry) => entry.kind === 'product'))
const itemId = job.result.itemId
await page.evaluate(() => window.roomfit.selectItem(null))
mark('placed-auto', { position: await page.evaluate((id) => window.roomfit.state().layout.items.find((item) => item.id === id).position, itemId) })
await page.waitForTimeout(2500)
const afterShot = (await canvas.screenshot()).toString('base64')
const { sx, sy, n } = await page.evaluate(async ({ before, after }) => {
  const pixels = async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    context.drawImage(bitmap, 0, 0)
    return { width: bitmap.width, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data }
  }
  const [a, b] = [await pixels(before), await pixels(after)]
  let sx = 0, sy = 0, n = 0
  for (let i = 0; i < b.data.length; i += 8) {
    const diff = Math.abs(b.data[i] - a.data[i]) + Math.abs(b.data[i + 1] - a.data[i + 1]) + Math.abs(b.data[i + 2] - a.data[i + 2])
    if (diff > 90) { const p = i / 4; sx += p % b.width; sy += Math.floor(p / b.width); n++ }
  }
  return { sx, sy, n }
}, { before, after: afterShot })
const box = await canvas.boundingBox()
const from = { x: box.x + sx / n, y: box.y + sy / n }
mark('located', { from, pixels: n })
const positionOf = () => page.evaluate((id) => window.roomfit.state().layout.items.find((item) => item.id === id).position, itemId)
const drag = async (start, end, steps = 45) => {
  await page.mouse.move(start.x, start.y, { steps: 8 })
  await page.waitForTimeout(250)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps })
  await page.waitForTimeout(250)
  await page.mouse.up()
  await page.waitForTimeout(600)
  return end
}
let grab = from
const p0 = await positionOf()
grab = await drag(grab, { x: grab.x + 110, y: grab.y }, 25)
const p1 = await positionOf()
grab = await drag(grab, { x: grab.x, y: grab.y + 90 }, 25)
const p2 = await positionOf()
const a11 = (p1.x - p0.x) / 110, a21 = (p1.z - p0.z) / 110, a12 = (p2.x - p1.x) / 90, a22 = (p2.z - p1.z) / 90
const det = a11 * a22 - a12 * a21
const goal = { x: -180, z: 330 }
for (let attempt = 0; attempt < 3; attempt++) {
  const now = await positionOf()
  const ex = goal.x - now.x, ez = goal.z - now.z
  if (Math.hypot(ex, ez) < 12) break
  const dx = (a22 * ex - a12 * ez) / det, dy = (-a21 * ex + a11 * ez) / det
  grab = await drag(grab, { x: grab.x + dx, y: grab.y + dy }, attempt === 0 ? 60 : 25)
}
mark('dragged', { position: await positionOf(), calibration: { a11, a12, a21, a22 } })
await page.waitForTimeout(1200)
for (let i = 0; i < 6; i++) { await page.keyboard.press('e'); await page.waitForTimeout(350) }
mark('rotated', { item: await page.evaluate((id) => window.roomfit.state().layout.items.find((item) => item.id === id), itemId), problems: await page.evaluate(() => ({ c: window.roomfit.state().collisions, o: window.roomfit.state().outOfBounds })) })
await page.waitForTimeout(3000)
await page.getByRole('button', { name: 'Render this view' }).click()
await page.getByRole('region', { name: 'Jobs' }).getByRole('article', { name: /^Room render/ }).first().getByRole('button', { name: 'Open' }).waitFor({ timeout: 300_000 })
mark('render-done')
await page.waitForTimeout(5000)
mark('end')
writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 2))
const video = page.video()
await context.close()
renameSync(await video.path(), `${OUT}/raw.webm`)
await browser.close()
console.log('recorded')
