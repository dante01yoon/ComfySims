import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

const OUT = process.env.DEMO_OUT ?? 'demo/out/walkthrough'
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
  Object.assign(caption.style, { position: 'fixed', left: '24px', top: '24px', maxWidth: '900px', padding: '10px 16px', background: 'rgba(20,22,26,.82)', color: '#fff', font: '600 24px/1.35 system-ui,sans-serif', borderRadius: '10px', zIndex: 50 })
  document.body.appendChild(caption)
})
const say = (text) => page.evaluate((t) => { document.getElementById('demo-caption').textContent = t }, text)
const pause = (ms) => page.waitForTimeout(ms)
const chip = (name) => page.getByRole('button', { name, exact: true }).click()

mark('start')
await say('A house furnished with 15 pieces generated from product photos on Comfy Cloud')
const home = await page.evaluate(() => window.roomfit.camera())
for (let i = 0; i <= 50; i++) {
  const a = Math.atan2(home.position.x - home.target.x, home.position.z - home.target.z) + ((i / 50 - 0.5) * 30 * Math.PI) / 180
  const r = Math.hypot(home.position.x - home.target.x, home.position.z - home.target.z)
  await page.evaluate(([p, t]) => window.roomfit.setCamera({ position: p, target: t }), [{ x: home.target.x + Math.sin(a) * r, y: home.position.y, z: home.target.z + Math.cos(a) * r }, home.target])
  await pause(60)
}

await say('Living room, evening light → render an eye-level photo on Comfy Cloud')
await chip('Living')
await pause(1200)
await chip('Evening')
await pause(1500)
mark('render-click')
await page.getByRole('button', { name: 'Render this view' }).click()
await page.getByRole('img', { name: 'Render result' }).waitFor({ timeout: 10 * 60_000 })
mark('rendered')
await say('Rendered on Comfy Cloud from an eye-level shot of that room')
await pause(4500)
await page.getByRole('button', { name: 'Close' }).click()

await say('Office: add a floor lamp from a product photo — it finds a free spot against a wall')
await chip('Office')
await chip('Work')
await pause(1500)
mark('lamp-click')
const outcome = page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({ fileName: 'lamp.png', imageBase64, name: 'Floor lamp', dimensions: { width: 45, depth: 45, height: 160 }, mode: 'auto' }), lamp)
await page.waitForFunction(() => window.roomfit.state().jobs.at(-1)?.status === 'in_progress', null, { timeout: 120_000 }).catch(() => {})
await say('Comfy Cloud is generating the lamp in 3D…')
const result = await outcome
mark('lamp-placed')
if (!result.ok) throw new Error(result.message)
await say(`Placed in the office: fitted to 45 × 45 × 160 cm (${result.report.requested} → ${result.report.mode}, turned ${result.report.yawDegrees}°)`)
await pause(4500)

await say('Back to the whole house')
await page.evaluate(() => window.roomfit.focusZone(null))
await chip('Evening')
await pause(3500)
mark('end')
writeFileSync(`${OUT}/state.json`, JSON.stringify(await page.evaluate(() => window.roomfit.state()), null, 2))
const video = page.video()
await context.close()
renameSync(await video.path(), `${OUT}/raw.webm`)
writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 2))
await browser.close()
