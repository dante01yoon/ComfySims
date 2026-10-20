import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const OUT = process.env.MOTION_OUT ?? 'demo/out/motion/before'
const layout = JSON.parse(readFileSync('demo/out/agent/final-state.json', 'utf8')).layout
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: Number(process.env.MOTION_DPR ?? 2) })
const cdp = await page.context().newCDPSession(page)
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
const window_ = async (name, action) => {
  const from = await page.evaluate(() => performance.now())
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.start')
  await action()
  const { profile } = await cdp.send('Profiler.stop')
  const to = await page.evaluate(() => performance.now())
  writeFileSync(`${OUT}/${name}.cpuprofile`, JSON.stringify(profile))
  return page.evaluate(({ name, from, to }) => {
    const frames = window.__motion.frames.filter((at) => at >= from && at <= to)
    const gaps = frames.slice(1).map((at, index) => at - frames[index]).sort((a, b) => a - b)
    const pick = (q) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] ?? null
    const camera = window.__motion.camera.filter(({ at }) => at >= from && at <= to)
    const jumps = camera.slice(1).map((sample, index) => Math.hypot(sample.x - camera[index].x, sample.y - camera[index].y, sample.z - camera[index].z))
    const longTasks = window.__motion.longTasks.filter(({ at }) => at >= from && at <= to)
    return {
      name,
      seconds: +((to - from) / 1000).toFixed(2),
      fps: +(frames.length / ((to - from) / 1000)).toFixed(1),
      frameMsP50: pick(0.5) && +pick(0.5).toFixed(1),
      frameMsP95: pick(0.95) && +pick(0.95).toFixed(1),
      framesOver33ms: gaps.filter((gap) => gap > 33.4).length,
      longTasks: longTasks.length,
      longestTaskMs: longTasks.length ? Math.round(Math.max(...longTasks.map(({ ms }) => ms))) : 0,
      largestCameraStepCm: jumps.length ? Math.round(Math.max(...jumps)) : 0
    }
  }, { name, from, to })
}



await page.evaluate(() => {
  window.__motion = { frames: [], longTasks: [], camera: [] }
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__motion.longTasks.push({ at: entry.startTime, ms: entry.duration }) }).observe({ type: 'longtask', buffered: false })
  const tick = (now) => {
    window.__motion.frames.push(now)
    const { position } = (window.roomfit.cameraFrame ?? window.roomfit.camera)?.() ?? { position: { x: 0, y: 0, z: 0 } }
    window.__motion.camera.push({ at: now, x: position.x, y: position.y, z: position.z })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const results = []
results.push(await window_('load-layout', async () => {
  await page.evaluate((value) => window.roomfit.load(value), layout)
  await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 120_000 })
}))
results.push(await window_('switch-to-studio', async () => {
  await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.setScene('work') })
  await page.waitForTimeout(2000)
}))
await page.waitForTimeout(1000)
const canvas = await page.locator('canvas').first().boundingBox()
const centre = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 }
results.push(await window_('idle-house', () => page.waitForTimeout(3000)))
results.push(await window_('orbit-drag', async () => {
  await page.mouse.move(centre.x - 200, centre.y)
  await page.mouse.down()
  for (let step = 0; step <= 90; step += 1) {
    await page.mouse.move(centre.x - 200 + step * 4.5, centre.y + Math.sin(step / 15) * 40)
    await page.waitForTimeout(33)
  }
  await page.mouse.up()
}))
results.push(await window_('focus-room', async () => {
  await page.evaluate(() => window.roomfit.focusZone('bedroom'))
  await page.waitForTimeout(2000)
}))
results.push(await window_('wheel-zoom', async () => {
  await page.mouse.move(centre.x, centre.y)
  for (let step = 0; step < 20; step += 1) {
    await page.mouse.wheel(0, step < 10 ? -120 : 120)
    await page.waitForTimeout(60)
  }
}))
results.push(await window_('idle-room', () => page.waitForTimeout(3000)))
const info = await page.evaluate(() => ({ userAgent: navigator.userAgent, dpr: devicePixelRatio, items: window.roomfit.state().layout.items.length }))
await page.screenshot({ path: `${OUT}/view.png` })
writeFileSync(`${OUT}/results.json`, JSON.stringify({ at: new Date().toISOString(), info, results }, null, 2))
console.table(results)
await browser.close()
