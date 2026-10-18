import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

const OUT = process.env.DEMO_OUT ?? 'demo/out/workspace'
const layout = JSON.parse(readFileSync('demo/out/house/furnished-layout.json', 'utf8'))
const lamp = readFileSync('demo/out/lamp-photo.png').toString('base64')
mkdirSync(`${OUT}/video`, { recursive: true })
const marks = []
const started = Date.now()
const mark = (label) => { marks.push({ label, t: (Date.now() - started) / 1000 }); console.log(`${marks.at(-1).t.toFixed(1)}s ${label}`) }

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1600, height: 900 } } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate((l) => window.roomfit.load(l), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.setScene('work') })
await page.evaluate(() => {
  const caption = document.createElement('div')
  caption.id = 'demo-caption'
  Object.assign(caption.style, { position: 'fixed', left: '24px', top: '24px', maxWidth: '760px', padding: '10px 16px', background: 'rgba(20,22,26,.85)', color: '#fff', font: '600 22px/1.35 system-ui,sans-serif', borderRadius: '10px', zIndex: 60, pointerEvents: 'none' })
  document.body.appendChild(caption)
})
const say = (text) => page.evaluate((t) => { document.getElementById('demo-caption').textContent = t }, text)
const pause = (ms) => page.waitForTimeout(ms)
const card = (title) => page.getByRole('region', { name: 'Jobs' }).getByRole('article', { name: title })
async function look(viewer) {
  const box = await viewer.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (const [dx, dy] of [[260, 0], [-260, -60], [0, 0]]) await page.mouse.move(cx + dx, cy + dy, { steps: 40 })
  await page.mouse.up()
}

mark('start')
await say('Two Comfy Cloud jobs at once: a lamp for the office, and a render of the living room')
const lampJob = page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({ fileName: 'lamp.png', imageBase64, name: 'Floor lamp', dimensions: { width: 45, depth: 45, height: 160 }, mode: 'auto', zoneId: 'office' }), lamp)
await pause(800)
await page.getByRole('button', { name: 'Living', exact: true }).click()
await pause(800)
await page.getByRole('button', { name: 'Render this view' }).click()
await pause(2500)
mark('both-running')

await say('Meanwhile: place an armchair from the library in the bedroom')
await page.getByRole('button', { name: 'Bedroom', exact: true }).click()
await pause(1000)
await page.getByRole('region', { name: 'Library' }).getByRole('listitem').filter({ hasText: 'Armchair' }).getByRole('button', { name: 'Place in' }).click()
await page.getByRole('menuitem', { name: 'Bedroom' }).click()
await pause(2500)

await say('Rename a room from its label: Office → Studio')
await page.evaluate(() => window.roomfit.focusZone(null))
await pause(1200)
await page.getByRole('button', { name: /^Office · \d+ items?$/ }).dblclick()
await page.getByRole('textbox', { name: 'Room name' }).fill('Studio')
await pause(600)
await page.getByRole('textbox', { name: 'Room name' }).press('Enter')
await pause(2000)

await say('The living-room render is done → open it as a 3D photo (MoGe on Comfy Cloud)')
await card('Room render · Living').getByRole('button', { name: 'View as 3D photo' }).waitFor({ timeout: 10 * 60_000 })
mark('render-done')
await page.getByRole('button', { name: 'Close' }).click().catch(() => {})
await card('Room render · Living').getByRole('button', { name: 'View as 3D photo' }).click()
mark('photo3d-click')
const viewer = page.getByRole('dialog', { name: '3D photo' })
await viewer.waitFor({ timeout: 10 * 60_000 })
mark('photo3d-open')
await say('3D photo: drag to look around (turning is limited — it is built from one image)')
await pause(1500)
await look(viewer)
await pause(1500)
await viewer.getByRole('button', { name: 'Back' }).click()

await say('A room photo (AI-generated stand-in for a real phone photo) → 3D photo')
mark('upload-click')
await page.getByLabel('Room photo').setInputFiles('demo/out/room-photo-standin.png')
await page.getByRole('dialog', { name: '3D photo' }).waitFor({ timeout: 10 * 60_000 })
mark('upload-open')
await pause(1200)
await look(page.getByRole('dialog', { name: '3D photo' }))
await pause(1500)
await page.getByRole('dialog', { name: '3D photo' }).getByRole('button', { name: 'Back' }).click()

const lampResult = await lampJob
mark('lamp-done')
await say(lampResult.ok ? 'The lamp is in the Studio, fitted to 45 × 45 × 160 cm — all jobs on the right' : `Lamp failed: ${lampResult.message}`)
await page.getByRole('button', { name: 'Studio', exact: true }).click()
await pause(4000)
mark('end')
writeFileSync(`${OUT}/state.json`, JSON.stringify(await page.evaluate(() => window.roomfit.state()), null, 2))
const video = page.video()
await context.close()
renameSync(await video.path(), `${OUT}/raw.webm`)
writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 2))
await browser.close()
