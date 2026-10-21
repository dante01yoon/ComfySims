import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'

const out = 'demo/out/m18'
const room = 'living'
const extraEyes = [{ x: -560, z: 150 }, { x: -140, z: 190 }]
mkdirSync(`${out}/tour-multi`, { recursive: true })
const key = readFileSync('.env.local', 'utf8').match(/COMFY_CLOUD_API_KEY=(.+)/)[1].trim()
const CLOUD = 'https://cloud.comfy.org'
const layout = JSON.parse(readFileSync('demo/out/house/furnished-layout.json', 'utf8'))
const glbs = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  try { response.end(readFileSync(`demo/out${decodeURIComponent(new URL(request.url, 'http://x').pathname)}`)) } catch { response.statusCode = 404; response.end() }
}).listen(5180)

async function cloudPanorama(graph, depthPng, name) {
  const form = new FormData()
  form.append('image', new Blob([depthPng], { type: 'image/png' }), `${name}.png`)
  form.append('type', 'input')
  const { name: uploaded } = await (await fetch(`${CLOUD}/api/upload/image`, { method: 'POST', headers: { 'X-API-Key': key }, body: form })).json()
  const prompt = structuredClone(graph)
  for (const node of Object.values(prompt)) if (node._meta?.title === 'roomfit:depth') node.inputs.image = uploaded
  const { prompt_id } = await (await fetch(`${CLOUD}/api/prompt`, { method: 'POST', headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) })).json()
  const started = Date.now()
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const job = await (await fetch(`${CLOUD}/api/jobs/${prompt_id}`, { headers: { 'X-API-Key': key } })).json()
    if (job.status === 'failed' || job.status === 'cancelled') throw new Error(`${name}: ${job.status}`)
    if (job.status !== 'completed') continue
    const saveId = Object.entries(prompt).find(([, node]) => node._meta?.title === 'roomfit:save')[0]
    const file = job.outputs[saveId].images[0]
    const image = Buffer.from(await (await fetch(`${CLOUD}/api/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder)}&type=output`, { headers: { 'X-API-Key': key } })).arrayBuffer())
    return { image, jobId: prompt_id, seconds: (Date.now() - started) / 1000 }
  }
}
const dataUrl = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--mute-audio'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.addInitScript(() => {
  const hook = new EventTarget()
  hook.addEventListener('observe', ({ detail }) => {
    if (detail.isScene) (window.__spikeScenes ??= []).push(detail)
    if (detail.isWebGLRenderer) (window.__spikeRenderers ??= []).push(detail)
  })
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

const centre = await page.evaluate((zone) => window.roomfit.depthPanorama(zone), room)
const first = await page.evaluate(async (zone) => {
  const outcome = await window.roomfit.view360({ zoneId: zone })
  if (!outcome.ok) throw new Error(JSON.stringify(outcome))
  const blob = await (await fetch(outcome.image)).blob()
  const image = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob) })
  return { image, jobId: outcome.jobId, graph: window.roomfit.jobWorkflow(outcome.jobId).submitted }
}, room)
await page.evaluate(() => window.roomfit.close360())
const views = [{ eye: { ...centre.standingPoint, y: centre.eyeHeightCm }, depth: centre.image, colour: first.image, jobId: first.jobId }]

await page.evaluate(() => window.roomfit.walk())
await page.waitForTimeout(1500)
await page.evaluate(async () => {
  const threeUrl = performance.getEntriesByType('resource').map(({ name }) => name).find((name) => /\.vite\/deps\/three\.js/.test(name))
  window.__THREE = await import(threeUrl)
  window.__passes = await import('/src/passes.ts')
  const meshes = (scene) => { let count = 0; scene.traverse((node) => { if (node.isMesh) count++ }); return count }
  window.__scene = window.__spikeScenes.reduce((best, entry) => (meshes(entry) > meshes(best) ? entry : best))
  window.__renderer = window.__spikeRenderers.find((renderer) => renderer.domElement === document.querySelector('canvas'))
})
for (const [index, eye] of extraEyes.entries()) {
  const depth = await page.evaluate(({ eye, zones, wallHeight }) => {
    const inside = (polygon, { x, z }) => polygon.reduce((acc, a, i) => { const b = polygon[(i + 1) % polygon.length]; return (a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x ? !acc : acc }, false)
    const ceiling = { heightCm: wallHeight, covers: (point) => zones.some((zone) => inside(zone.polygon, point)) }
    return window.__passes.exportDepthPanorama(window.__renderer, window.__scene, { x: eye.x, y: 160, z: eye.z }, ceiling, { width: 2048, height: 1024 })
  }, { eye, zones: layout.room.zones, wallHeight: layout.room.wallHeight })
  const png = Buffer.from(depth.split(',')[1], 'base64')
  writeFileSync(`${out}/depth-extra-${index}.png`, png)
  const generated = await cloudPanorama(first.graph, png, `m18-depth-${index}`)
  writeFileSync(`${out}/panorama-extra-${index}.png`, generated.image)
  views.push({ eye: { ...eye, y: 160 }, depth, colour: dataUrl(generated.image), jobId: generated.jobId, seconds: generated.seconds })
}
writeFileSync(`${out}/views.json`, JSON.stringify(views.map(({ eye, jobId, seconds }) => ({ eye, jobId, seconds })), null, 2))

await page.evaluate(async (views) => {
  const THREE = window.__THREE
  const load = (url) => new Promise((resolve) => new THREE.TextureLoader().load(url, resolve))
  const textures = await Promise.all(views.map(async (view) => {
    const colour = await load(view.colour)
    colour.colorSpace = THREE.SRGBColorSpace
    return { colour, distance: await load(view.depth), eye: new THREE.Vector3(view.eye.x, view.eye.y, view.eye.z) }
  }))
  const fragment = `
    uniform sampler2D colour[3]; uniform sampler2D distance[3]; uniform vec3 eye[3]; uniform vec3 base; varying vec3 world;
    const float PI = 3.141592653589793;
    vec2 uvOf(vec3 dir) { return vec2((atan(dir.x, dir.z) + PI) / (2.0 * PI), (asin(clamp(dir.y, -1.0, 1.0)) + PI / 2.0) / PI); }
    void main() {
      vec3 best = base * 0.55; float bestDistance = 1e9;
      ${[0, 1, 2].map((i) => `{
        vec3 ray = world - eye[${i}]; float d = length(ray); vec2 uv = uvOf(ray / d);
        float seen = 40.0 + (1.0 - texture2D(distance[${i}], uv).r) * 560.0;
        bool visible = d <= seen + 20.0 || seen >= 595.0;
        if (visible && d < bestDistance) { bestDistance = d; best = texture2D(colour[${i}], uv).rgb; }
      }`).join('\n')}
      gl_FragColor = vec4(best, 1.0);
      #include <colorspace_fragment>
    }`
  window.__scene.traverse((node) => {
    if (!node.isMesh) return
    const base = node.material?.color ? node.material.color.clone() : new THREE.Color(0.6, 0.6, 0.6)
    node.material = new THREE.ShaderMaterial({
      uniforms: { colour: { value: textures.map((t) => t.colour) }, distance: { value: textures.map((t) => t.distance) }, eye: { value: textures.map((t) => t.eye) }, base: { value: base } },
      vertexShader: 'varying vec3 world; void main() { vec4 w = modelMatrix * vec4(position, 1.0); world = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: fragment
    })
  })
}, views)

await page.addStyleTag({ content: 'body * { visibility: hidden !important } canvas { visibility: visible !important }' })
const sofa = layout.items.find((item) => item.assetId.includes('sofa')).position
const face = (target, pitch = -12) => page.evaluate(({ target, pitch }) => {
  const nav = window.roomfit.state().navigation
  const want = (Math.atan2(target.x - nav.eye.x, target.z - nav.eye.z) * 180) / Math.PI
  window.roomfit.look({ yawDeg: ((want - nav.yawDeg + 540) % 360) - 180, pitchDeg: pitch - nav.pitchDeg })
}, { target, pitch })
let frame = 0
const snap = async () => {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.screenshot({ path: `${out}/tour-multi/${String(frame++).padStart(4, '0')}.png`, clip: { x: 0, y: 0, width: 960, height: 720 } })
}
await page.evaluate(() => window.roomfit.stopWalking())
await page.waitForTimeout(800)
await page.evaluate(({ x, z }) => window.roomfit.walk({ x, z }), extraEyes[0])
await page.waitForTimeout(1500)
await face(sofa)
await page.waitForTimeout(1000)
for (let step = 0; step < 90; step++) { await page.evaluate(() => window.roomfit.walkStep({ forward: 0, right: 4.7 })); await face(sofa); await snap() }
for (let step = 0; step < 120; step++) { await page.evaluate(() => window.roomfit.look({ yawDeg: 3, pitchDeg: 0 })); await snap() }
for (let step = 0; step < 90; step++) { await page.evaluate(() => window.roomfit.walkStep({ forward: 2.5, right: 0 })); await snap() }
await browser.close()
glbs.close()
