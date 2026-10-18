import { chromium } from '@playwright/test'

const [rotationY = '0', out = 'demo/out/still.png'] = process.argv.slice(2)
const layout = {
  version: 1, id: 'demo', name: 'Demo living room', units: 'cm',
  room: { kind: 'box', width: 420, depth: 360, height: 240 },
  assets: [{ id: 'sofa', name: 'Sofa', uri: 'http://127.0.0.1:5180/sofa-fitted-exact.glb', dimensions: { width: 200, depth: 90, height: 85 }, source: { kind: 'generated', workflow: 'trellis2' } }],
  items: [{ id: 'sofa-1', assetId: 'sofa', position: { x: 0, y: 0, z: 0 }, rotationY: Number(rotationY) }]
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate((l) => window.roomfit.load(l), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 60_000 })
await page.evaluate(() => window.roomfit.setCamera({ position: { x: 0, y: 160, z: 380 }, target: { x: 0, y: 40, z: 0 } }))
await page.waitForTimeout(1500)
await page.screenshot({ path: out })
await browser.close()
