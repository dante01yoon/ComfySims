import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'

const out = 'demo/out/m17'
const frames = `${out}/depth-frames`
mkdirSync(frames, { recursive: true })
const size = { width: 1280, height: 704 }
const depthRange = { nearCm: 40, farCm: 900 }
const { start, frameCount, dollyCm, panDeg } = JSON.parse(readFileSync(`${out}/path.json`, 'utf8'))
const layout = JSON.parse(readFileSync('demo/out/house/furnished-layout.json', 'utf8'))
const glbs = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  try { response.end(readFileSync(`demo/out${decodeURIComponent(new URL(request.url, 'http://x').pathname)}`)) } catch { response.statusCode = 404; response.end() }
}).listen(5180)

const browser = await chromium.launch({ args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: size })
await page.addInitScript(() => {
  const hook = new EventTarget()
  hook.addEventListener('observe', ({ detail }) => {
    if (detail.isWebGLRenderer) (window.__spikeRenderers ??= []).push(detail)
    if (detail.isScene) (window.__spikeScenes ??= []).push(detail)
  })
  window.__THREE_DEVTOOLS__ = hook
})
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.focusZone('living') })
await page.waitForTimeout(1500)
await page.evaluate(() => window.roomfit.walk())
await page.waitForTimeout(2000)

function poseAt(t) {
  const ease = t * t * (3 - 2 * t)
  const look = { x: start.target.x - start.position.x, z: start.target.z - start.position.z }
  const length = Math.hypot(look.x, look.z)
  const yaw = Math.atan2(look.x, look.z) + (panDeg * Math.PI * ease) / 180
  const position = { x: start.position.x + (look.x / length) * dollyCm * ease, y: start.position.y, z: start.position.z + (look.z / length) * dollyCm * ease }
  return { position, target: { x: position.x + Math.sin(yaw) * length, y: start.target.y, z: position.z + Math.cos(yaw) * length } }
}

await page.evaluate(async () => {
  const threeUrl = performance.getEntriesByType('resource').map(({ name }) => name).find((name) => /\.vite\/deps\/three\.js/.test(name))
  window.__spikeThree = await import(threeUrl)
  window.__spikePasses = await import('/src/passes.ts')
  const canvas = document.querySelector('canvas')
  window.__spikeRenderer = window.__spikeRenderers.find((renderer) => renderer.domElement === canvas)
  let meshes = (scene) => { let count = 0; scene.traverse((node) => { if (node.isMesh) count++ }); return count }
  window.__spikeScene = window.__spikeScenes.reduce((best, scene) => (meshes(scene) > meshes(best) ? scene : best))
  return { threeUrl, renderers: window.__spikeRenderers.length, scenes: window.__spikeScenes.map(meshes) }
}).then((found) => { console.log(JSON.stringify({ ...found, scenes: found.scenes.length, max: Math.max(...found.scenes) })) })
for (let frame = 0; frame < frameCount; frame++) {
  const depth = await page.evaluate(({ pose, size, depthRange }) => {
    const camera = new window.__spikeThree.PerspectiveCamera(50, size.width / size.height, 1, 20000)
    camera.position.set(pose.position.x, pose.position.y, pose.position.z)
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z)
    camera.updateMatrixWorld()
    return window.__spikePasses.exportPasses(window.__spikeRenderer, window.__spikeScene, camera, size, depthRange).depth
  }, { pose: poseAt(frame / (frameCount - 1)), size, depthRange })
  writeFileSync(`${frames}/${String(frame).padStart(4, '0')}.png`, Buffer.from(depth.split(',')[1], 'base64'))
}
await browser.close()
glbs.close()
