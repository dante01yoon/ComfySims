import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'

const OUT = process.env.DEMO_OUT ?? 'demo/out/studio'
const SIZE = { width: 1600, height: 900 }
const layout = JSON.parse(readFileSync('demo/out/house/furnished-layout.json', 'utf8'))
rmSync(`${OUT}/frames`, { recursive: true, force: true })
mkdirSync(`${OUT}/frames`, { recursive: true })

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: SIZE })
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate((l) => window.roomfit.load(l), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => window.roomfit.setView('studio'))
await page.evaluate(() => window.roomfit.setScene('work'))
await page.waitForTimeout(2000)

const home = await page.evaluate(() => window.roomfit.camera())
const target = home.target
const radius = Math.hypot(home.position.x - target.x, home.position.z - target.z)
const height = home.position.y - target.y
const startAngle = Math.atan2(home.position.x - target.x, home.position.z - target.z)
let frame = 0
const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
async function shot() {
  await settle()
  await page.screenshot({ path: `${OUT}/frames/${String(frame++).padStart(5, '0')}.png` })
}
async function orbit(fromDeg, toDeg, frames, zoom = 1, lift = 1) {
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1)
    const eased = t * t * (3 - 2 * t)
    const angle = startAngle + ((fromDeg + (toDeg - fromDeg) * eased) * Math.PI) / 180
    const r = radius * zoom
    await page.evaluate(([p, tg]) => window.roomfit.setCamera({ position: p, target: tg }), [
      { x: target.x + Math.sin(angle) * r, y: target.y + height * zoom * lift, z: target.z + Math.cos(angle) * r }, target
    ])
    await shot()
  }
}
async function preset(name, holdFrames) {
  await page.evaluate((p) => window.roomfit.setScene(p), name)
  for (let i = 0; i < holdFrames; i++) await shot()
}

await orbit(-25, 0, 90)
await preset('work', 20)
await orbit(0, 20, 60, 0.92)
await preset('reading', 30)
await orbit(20, 35, 45, 0.85)
await preset('movie', 30)
await orbit(35, 15, 45, 0.85)
await preset('evening', 45)
await orbit(15, -20, 90, 0.75, 0.95)
console.log(`frames: ${frame}`)
await browser.close()
