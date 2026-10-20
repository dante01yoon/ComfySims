import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync } from 'node:fs'
import { chromium } from '@playwright/test'

const OUT = 'demo/out/walk'
const layout = JSON.parse(readFileSync('demo/out/agent/final-state.json', 'utf8')).layout
mkdirSync(`${OUT}/video`, { recursive: true })

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1600, height: 900 } } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 120_000 })
await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.setScene('evening') })
await page.waitForFunction(() => !window.roomfit.cameraMoving())
await page.waitForTimeout(1500)

const box = await page.locator('canvas').first().boundingBox()
const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
const hold = async (key, ms) => {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
}
const look = async (dx, dy, steps = 30) => {
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.down()
  await page.mouse.move(centre.x + dx, centre.y + dy, { steps })
  await page.mouse.up()
}

await page.getByRole('button', { name: 'Living', exact: true }).click()
await page.waitForFunction(() => !window.roomfit.cameraMoving())
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Walk', exact: true }).click()
await page.waitForFunction(() => !window.roomfit.cameraMoving())
await page.waitForTimeout(800)
await look(-260, 0, 40)
await page.waitForTimeout(500)
await look(260, 0, 40)
await page.waitForTimeout(400)
const walkTowards = async (point) => {
  const turn = await page.evaluate(({ x, z }) => {
    const nav = window.roomfit.state().navigation
    const wanted = (Math.atan2(x - nav.eye.x, z - nav.eye.z) * 180) / Math.PI
    const delta = ((wanted - nav.yawDeg + 540) % 360) - 180
    return { delta, distance: Math.hypot(x - nav.eye.x, z - nav.eye.z) }
  }, point)
  for (let step = 1; step <= 12; step += 1) {
    await page.evaluate((d) => window.roomfit.look({ yawDeg: d / 12, pitchDeg: 0 }), turn.delta)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(200)
  await hold('w', (turn.distance / 140) * 1000)
}
await page.locator('canvas').first().focus()
await walkTowards({ x: -120, z: 260 })
await walkTowards({ x: 90, z: 260 })
await page.waitForTimeout(400)
await look(-320, 0, 50)
await page.waitForTimeout(600)
await look(520, 0, 60)
await page.waitForTimeout(800)
await page.keyboard.press('Escape')
await page.waitForFunction(() => !window.roomfit.cameraMoving())
await page.waitForTimeout(1500)

const video = page.video()
await context.close()
renameSync(await video.path(), `${OUT}/raw.webm`)
await browser.close()
mkdirSync('docs/recordings/media/gif', { recursive: true })
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${OUT}/raw.webm`, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '22', '-movflags', '+faststart', '-an', 'docs/recordings/media/roomfit-walk.mp4'])
console.log('wrote docs/recordings/media/roomfit-walk.mp4')
