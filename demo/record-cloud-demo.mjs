import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

const OUT = process.env.DEMO_OUT ?? 'demo/out/cloud'
const PHOTO = process.env.DEMO_PHOTO ?? 'demo/out/sofa-photo.png'
const room = {
  version: 1, id: 'cloud-demo', name: 'Living room', units: 'cm',
  room: { kind: 'box', width: 420, depth: 360, height: 240 },
  assets: [{ id: 'table', name: 'Coffee table (no model yet)', uri: '/fixtures/glb/missing.glb', dimensions: { width: 100, depth: 50, height: 40 }, source: { kind: 'upload' } }],
  items: [{ id: 'table-1', assetId: 'table', position: { x: 0, y: 0, z: 40 }, rotationY: 0 }]
}

mkdirSync(`${OUT}/video`, { recursive: true })
const marks = []
const started = Date.now()
const mark = (label) => { marks.push({ label, t: (Date.now() - started) / 1000 }); console.log(`${marks.at(-1).t.toFixed(1)}s ${label}`) }

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1600, height: 900 } } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate((layout) => window.roomfit.load(layout), room)
await page.evaluate(() => window.roomfit.setCamera({ position: { x: 0, y: 260, z: 430 }, target: { x: 0, y: 40, z: -40 } }))
mark('start')
await page.waitForTimeout(1500)

await page.getByLabel('Product photo').setInputFiles(PHOTO)
await page.getByLabel('Product name').fill('Three-seat sofa')
await page.getByLabel('Width (cm)').fill('200')
await page.getByLabel('Depth (cm)').fill('90')
await page.getByLabel('Height (cm)').fill('85')
await page.waitForTimeout(1200)
mark('generate-click')
await page.getByRole('button', { name: 'Generate 3D' }).click()
await page.getByRole('status').filter({ hasText: /in.progress|generating|queued/i }).waitFor({ timeout: 120_000 }).catch(() => {})
mark('generating')
await page.getByRole('status').filter({ hasText: 'Placed' }).waitFor({ timeout: 15 * 60_000 })
mark('placed')
await page.waitForTimeout(1500)

const sofaId = await page.evaluate(() => window.roomfit.state().layout.items.at(-1).id)
await page.evaluate((id) => window.roomfit.moveItem(id, { x: 0, z: -125 }), sofaId)
for (let i = 0; i <= 30; i++) {
  const angle = -0.5 + i / 30
  await page.evaluate((a) => window.roomfit.setCamera({ position: { x: Math.sin(a) * 430, y: 230, z: Math.cos(a) * 430 }, target: { x: 0, y: 40, z: -60 } }), angle)
  await page.waitForTimeout(70)
}
await page.evaluate(() => window.roomfit.setCamera({ position: { x: 140, y: 150, z: 300 }, target: { x: 0, y: 50, z: -70 } }))
await page.waitForTimeout(1500)
mark('arranged')

await page.getByLabel('Render prompt').fill('Photograph of a bright Scandinavian living room, light oak floor, white walls, soft daylight from a window on the left, a wool rug, a few plants, interior design magazine, realistic.')
await page.waitForTimeout(800)
mark('render-click')
await page.getByRole('button', { name: 'Render' }).click()
await page.getByRole('img', { name: 'Render result' }).waitFor({ timeout: 10 * 60_000 })
mark('rendered')
await page.waitForTimeout(4000)
mark('end')

writeFileSync(`${OUT}/state.json`, JSON.stringify(await page.evaluate(() => window.roomfit.state()), null, 2))
await page.screenshot({ path: `${OUT}/final.png` })
const video = page.video()
await context.close()
renameSync(await video.path(), `${OUT}/raw.webm`)
writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 2))
await browser.close()
