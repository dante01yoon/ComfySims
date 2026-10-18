import { chromium } from '@playwright/test'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'

const OUT = 'demo/out'
const layout = {
  version: 1, id: 'demo-living-room', name: 'Demo living room', units: 'cm',
  room: { kind: 'box', width: 420, depth: 360, height: 240 },
  assets: [
    { id: 'sofa', name: 'Three-seat sofa', uri: 'http://127.0.0.1:5180/sofa-fitted-exact.glb', dimensions: { width: 200, depth: 90, height: 85 }, source: { kind: 'generated', workflow: 'trellis2-image-to-model' }, fit: { mode: 'exact', distortion: 1.157 } },
    { id: 'table', name: 'Coffee table (no model yet)', uri: 'http://127.0.0.1:5180/missing-table.glb', dimensions: { width: 100, depth: 50, height: 40 }, source: { kind: 'upload' } }
  ],
  items: [
    { id: 'sofa-1', assetId: 'sofa', position: { x: 0, y: 0, z: -125 }, rotationY: 0 },
    { id: 'table-1', assetId: 'table', position: { x: 0, y: 0, z: 10 }, rotationY: 0 }
  ]
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
mkdirSync(`${OUT}/video`, { recursive: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1280, height: 720 } } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate(() => {
  const caption = document.createElement('div')
  caption.id = 'demo-caption'
  Object.assign(caption.style, { position: 'fixed', left: '24px', bottom: '24px', maxWidth: '900px', padding: '10px 16px', background: 'rgba(0,0,0,0.72)', color: '#fff', font: '600 22px/1.35 system-ui, sans-serif', borderRadius: '8px', zIndex: 10 })
  document.body.appendChild(caption)
})
const say = (text) => page.evaluate((t) => { document.getElementById('demo-caption').textContent = t }, text)
const pause = (ms) => page.waitForTimeout(ms)
const camera = (position, target) => page.evaluate(([p, t]) => window.roomfit.setCamera({ position: p, target: t }), [position, target])
async function orbit(from, to, radius, height, target, steps = 40) {
  for (let i = 0; i <= steps; i++) {
    const angle = from + ((to - from) * i) / steps
    await camera({ x: Math.sin(angle) * radius, y: height, z: Math.cos(angle) * radius }, target)
    await pause(60)
  }
}

await say('Loading a 420 × 360 cm room…')
await page.evaluate((l) => window.roomfit.load(l), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).find((item) => item.id === 'sofa-1')?.meshLoaded, null, { timeout: 60_000 })
await say('AI-generated sofa, fitted to its listed size: 200 × 90 × 85 cm')
await orbit(-0.6, 0.6, 430, 230, { x: 0, y: 40, z: -60 })
await pause(800)
await say('Collisions use the listed size, not the mesh')
await page.evaluate(() => window.roomfit.moveItem('table-1', { x: 20, z: -95 }))
await pause(2800)
await say('Move it out of the way')
await page.evaluate(() => window.roomfit.moveItem('table-1', { x: 0, z: 10 }))
await pause(1500)
await say('Turn the sofa and push it to the side wall… does it fit?')
await page.evaluate(() => { window.roomfit.rotateItem('sofa-1', 90); window.roomfit.moveItem('sofa-1', { x: 180, z: -40 }) })
await orbit(0.6, 1.0, 430, 260, { x: 60, y: 40, z: -40 }, 20)
await say('No — it goes through the wall. Undo.')
await pause(2600)
await page.evaluate(() => { window.roomfit.undo(); window.roomfit.undo() })
await say('Back where it fits. Now export depth, normal and mask for ComfyUI')
await camera({ x: 140, y: 150, z: 300 }, { x: 0, y: 50, z: -70 })
await pause(1500)
const passes = await page.evaluate(() => window.roomfit.exportPasses({ width: 1152, height: 896 }))
for (const [name, url] of Object.entries(passes)) writeFileSync(`${OUT}/demo-${name}.png`, Buffer.from(url.split(',')[1], 'base64'))
writeFileSync(`${OUT}/demo-layout.json`, JSON.stringify(await page.evaluate(() => window.roomfit.save()), null, 2))
await say('Passes exported → render in ComfyUI')
await pause(1500)
await page.evaluate(() => { document.getElementById('demo-caption').remove() })
await page.screenshot({ path: `${OUT}/demo-view.png` })
const video = page.video()
await context.close()
renameSync(await video.path(), `${OUT}/editor-demo.webm`)
await browser.close()
console.log('recorded')
