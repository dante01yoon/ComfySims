import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'

const out = 'demo/out/m18'
mkdirSync(out, { recursive: true })
const room = process.env.ROOM ?? 'living'
const layout = JSON.parse(readFileSync('demo/out/house/furnished-layout.json', 'utf8'))
const glbs = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  try { response.end(readFileSync(`demo/out${decodeURIComponent(new URL(request.url, 'http://x').pathname)}`)) } catch { response.statusCode = 404; response.end() }
}).listen(5180)

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--mute-audio'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.addInitScript(() => {
  const hook = new EventTarget()
  hook.addEventListener('observe', ({ detail }) => { if (detail.isScene) (window.__spikeScenes ??= []).push(detail) })
  window.__THREE_DEVTOOLS__ = hook
})
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate((zone) => { window.roomfit.setView('studio'); window.roomfit.setScene('reading'); window.roomfit.focusZone(zone) }, room)
await page.waitForTimeout(1500)

const depth = await page.evaluate((zone) => window.roomfit.depthPanorama(zone), room)
const cached = process.env.PANORAMA
const panorama = cached ? `data:image/png;base64,${readFileSync(cached).toString('base64')}` : await page.evaluate(async (zone) => {
  const outcome = await window.roomfit.view360({ zoneId: zone })
  if (!outcome.ok) throw new Error(JSON.stringify(outcome))
  const blob = await (await fetch(outcome.image)).blob()
  return await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob) })
}, room)
if (!cached) writeFileSync(`${out}/panorama-${room}.png`, Buffer.from(panorama.split(',')[1], 'base64'))
await page.evaluate(() => window.roomfit.close360())

await page.evaluate(async ({ panorama, depth }) => {
  const threeUrl = performance.getEntriesByType('resource').map(({ name }) => name).find((name) => /\.vite\/deps\/three\.js/.test(name))
  const THREE = await import(threeUrl)
  const load = (url) => new Promise((resolve) => new THREE.TextureLoader().load(url, resolve))
  const [colour, distance] = await Promise.all([load(panorama), load(depth.image)])
  colour.colorSpace = THREE.SRGBColorSpace
  const eye = new THREE.Vector3(depth.standingPoint.x, depth.eyeHeightCm, depth.standingPoint.z)
  const material = new THREE.ShaderMaterial({
    uniforms: { colour: { value: colour }, distance: { value: distance }, eye: { value: eye } },
    vertexShader: 'varying vec3 world; void main() { vec4 w = modelMatrix * vec4(position, 1.0); world = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform sampler2D colour; uniform sampler2D distance; uniform vec3 eye; varying vec3 world;
      const float PI = 3.141592653589793;
      void main() {
        vec3 ray = world - eye;
        float d = length(ray);
        vec3 dir = ray / d;
        float yaw = atan(dir.x, dir.z);
        float pitch = asin(clamp(dir.y, -1.0, 1.0));
        vec2 uv = vec2((yaw + PI) / (2.0 * PI), (pitch + PI / 2.0) / PI);
        float seen = 40.0 + (1.0 - texture2D(distance, uv).r) * 560.0;
        vec3 c = texture2D(colour, uv).rgb;
        bool hidden = d > seen + 25.0 && seen < 595.0;
        gl_FragColor = vec4(hidden ? c * 0.25 + vec3(0.25, 0.0, 0.25) : c, 1.0);
        #include <colorspace_fragment>
      }`
  })
  const meshes = (scene) => { let count = 0; scene.traverse((node) => { if (node.isMesh) count++ }); return count }
  const scene = window.__spikeScenes.reduce((best, entry) => (meshes(entry) > meshes(best) ? entry : best))
  scene.traverse((node) => { if (node.isMesh) node.material = material })
}, { panorama, depth })

await page.evaluate(() => window.roomfit.walk())
await page.waitForTimeout(2000)
await page.addStyleTag({ content: 'body * { visibility: hidden !important } canvas { visibility: visible !important }' })
const sofa = layout.items.find((item) => item.assetId.includes('sofa')).position
const faceSofa = () => page.evaluate((target) => {
  const nav = window.roomfit.state().navigation
  const want = (Math.atan2(target.x - nav.eye.x, target.z - nav.eye.z) * 180) / Math.PI
  window.roomfit.look({ yawDeg: ((want - nav.yawDeg + 540) % 360) - 180, pitchDeg: -12 - nav.pitchDeg })
}, sofa)
mkdirSync(`${out}/tour-${room}`, { recursive: true })
let frame = 0
const snap = async () => {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.screenshot({ path: `${out}/tour-${room}/${String(frame++).padStart(4, '0')}.png`, clip: { x: 0, y: 0, width: 960, height: 720 } })
}
await faceSofa()
await page.waitForTimeout(1500)
for (let step = 0; step < 50; step++) { await page.evaluate(() => window.roomfit.look({ yawDeg: -1.2, pitchDeg: 0 })); await snap() }
for (let step = 0; step < 100; step++) { await page.evaluate(() => window.roomfit.look({ yawDeg: 1.2, pitchDeg: 0 })); await snap() }
for (let step = 0; step < 60; step++) { await page.evaluate(() => window.roomfit.walkStep({ forward: 2.5, right: 1 })); await faceSofa(); await snap() }
for (let step = 0; step < 60; step++) { await page.evaluate(() => window.roomfit.walkStep({ forward: 0, right: -3 })); await faceSofa(); await snap() }
await browser.close()
glbs.close()
