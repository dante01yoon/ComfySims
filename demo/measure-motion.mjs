import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, totalmem } from 'node:os'
import { gzipSync } from 'node:zlib'
import { chromium } from '@playwright/test'

const URL_ = process.env.MOTION_URL ?? 'http://127.0.0.1:5179/'
const LABEL = process.env.MOTION_LABEL ?? `${new Date().toISOString().slice(0, 10)}-run`
const DPR = Number(process.env.MOTION_DPR ?? 2)
const COMMIT = process.env.MOTION_COMMIT ?? execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
const PERF = 'docs/portfolio/perf'
const OUT = `${PERF}/${LABEL}`
const TRACE_CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', 'gpu', 'v8.execute', 'loading'].join(',')
const layout = JSON.parse(readFileSync('demo/out/agent/final-state.json', 'utf8')).layout
mkdirSync(OUT, { recursive: true })

async function run(index) {
  const browser = await chromium.launch({ headless: process.env.MOTION_HEADFUL !== '1', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--mute-audio'] })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: DPR })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Profiler.enable')
  await page.goto(URL_)
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())

  await page.evaluate(() => {
    window.__motion = { frames: [], longTasks: [], camera: [] }
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__motion.longTasks.push({ at: entry.startTime, ms: entry.duration })
    }).observe({ type: 'longtask', buffered: false })
    const tick = (now) => {
      window.__motion.frames.push(now)
      const { position } = (window.roomfit.cameraFrame ?? window.roomfit.camera)()
      window.__motion.camera.push({ at: now, x: position.x, y: position.y, z: position.z })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  const traceOf = async (action) => {
    const chunks = []
    const collect = ({ value }) => chunks.push(...value)
    cdp.on('Tracing.dataCollected', collect)
    await cdp.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReportEvents' })
    await action()
    const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve))
    await cdp.send('Tracing.end')
    await done
    cdp.off('Tracing.dataCollected', collect)
    return { traceEvents: chunks }
  }

  const topSelfTime = (profile, count = 8) => {
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
    const totals = new Map()
    profile.samples.forEach((id, index) => {
      const { functionName, url, lineNumber } = nodes.get(id).callFrame
      const key = `${functionName || '(anonymous)'} ${url.split('/').pop().split('?')[0]}:${lineNumber}`.trim()
      totals.set(key, (totals.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0))
    })
    const gcMs = Math.round((totals.get('(garbage collector) :-1') ?? 0) / 1000)
    const top = [...totals]
      .filter(([key]) => !/^\((idle|program|garbage collector|root)\)/.test(key))
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([fn, micros]) => ({ fn, ms: Math.round(micros / 1000) }))
    return { gcMs, top }
  }

  const heapMb = async () => (await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576
  const renderedFrames = () => page.evaluate(() => window.roomfit.renderStats?.().frames ?? null)

  const scenario = async (name, action) => {
    const heapBefore = await heapMb()
    const framesBefore = await renderedFrames()
    const from = await page.evaluate(() => performance.now())
    await cdp.send('Profiler.start')
    const trace = await traceOf(action)
    const { profile } = await cdp.send('Profiler.stop')
    const to = await page.evaluate(() => performance.now())
    const framesAfter = await renderedFrames()
    if (index === 0) {
      writeFileSync(`${OUT}/cpu-${name}.cpuprofile.gz`, gzipSync(JSON.stringify(profile)))
      writeFileSync(`${OUT}/trace-${name}.json.gz`, gzipSync(JSON.stringify(trace)))
    }
    const metrics = await page.evaluate(({ from, to }) => {
      const frames = window.__motion.frames.filter((at) => at >= from && at <= to)
      const gaps = frames.slice(1).map((at, index) => at - frames[index]).sort((a, b) => a - b)
      const pick = (q) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))]
      const camera = window.__motion.camera.filter(({ at }) => at >= from && at <= to)
      const steps = camera.slice(1).map((sample, index) => Math.hypot(sample.x - camera[index].x, sample.y - camera[index].y, sample.z - camera[index].z))
      const longTasks = window.__motion.longTasks.filter(({ at }) => at >= from && at <= to)
      return {
        seconds: +((to - from) / 1000).toFixed(2),
        fps: +(frames.length / ((to - from) / 1000)).toFixed(1),
        frameMsP50: gaps.length ? +pick(0.5).toFixed(1) : null,
        frameMsP95: gaps.length ? +pick(0.95).toFixed(1) : null,
        framesOver33ms: gaps.filter((gap) => gap > 33.4).length,
        longTasks: longTasks.length,
        longestTaskMs: longTasks.length ? Math.round(Math.max(...longTasks.map(({ ms }) => ms))) : 0,
        largestCameraStepCm: steps.length ? Math.round(Math.max(...steps)) : 0
      }
    }, { from, to })
    const heapAfter = await heapMb()
    return {
      name,
      ...metrics,
      renderedFrames: framesBefore === null || framesAfter === null ? null : framesAfter - framesBefore,
      heapMbAfter: +heapAfter.toFixed(1),
      heapMbDelta: +(heapAfter - heapBefore).toFixed(1),
      cpu: topSelfTime(profile)
    }
  }

  const results = []
  results.push(await scenario('load-layout', async () => {
    await page.evaluate((value) => window.roomfit.load(value), layout)
    await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 120_000 })
  }))
  results.push(await scenario('switch-to-studio', async () => {
    await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.setScene('work') })
    await page.waitForTimeout(2000)
  }))
  await page.waitForTimeout(1000)
  const canvas = await page.locator('canvas').first().boundingBox()
  const centre = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 }
  results.push(await scenario('idle-house', () => page.waitForTimeout(3000)))
  results.push(await scenario('orbit-drag', async () => {
    await page.mouse.move(centre.x - 200, centre.y)
    await page.mouse.down()
    for (let step = 0; step <= 90; step += 1) {
      await page.mouse.move(centre.x - 200 + step * 4.5, centre.y + Math.sin(step / 15) * 40)
      await page.waitForTimeout(33)
    }
    await page.mouse.up()
    await page.waitForTimeout(1000)
  }))
  results.push(await scenario('focus-room', async () => {
    await page.evaluate(() => window.roomfit.focusZone('bedroom'))
    await page.waitForTimeout(2000)
  }))
  results.push(await scenario('wheel-zoom', async () => {
    await page.mouse.move(centre.x, centre.y)
    for (let step = 0; step < 20; step += 1) {
      await page.mouse.wheel(0, step < 10 ? -120 : 120)
      await page.waitForTimeout(60)
    }
    await page.waitForTimeout(1000)
  }))
  results.push(await scenario('idle-room', () => page.waitForTimeout(3000)))
  const canWalk = await page.evaluate(() => typeof window.roomfit.walk === 'function')
  if (canWalk) {
    results.push(await scenario('walk-to-kitchen', async () => {
      await page.evaluate(() => window.roomfit.walk({ x: -300, z: 260, yawDeg: 90 }))
      await page.waitForTimeout(1000)
      await page.keyboard.down('w')
      await page.waitForTimeout(2500)
      await page.keyboard.up('w')
      await page.waitForTimeout(800)
    }))
  }


  const environment = {
    label: LABEL,
    commit: COMMIT,
    url: URL_,
    at: new Date().toISOString(),
    cpu: cpus()[0]?.model,
    memoryGb: Math.round(totalmem() / 1073741824),
    dpr: DPR,
    viewport: '1600x900',
    browser: browser.version(),
    gpu: await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      const debug = gl?.getExtension('WEBGL_debug_renderer_info')
      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unknown'
    }),
    items: await page.evaluate(() => window.roomfit.state().layout.items.length)
  }

  if (index === 0) await page.screenshot({ path: `${OUT}/view.png` })
  await browser.close()
  return { environment, results }
}

const RUNS = Number(process.env.MOTION_RUNS ?? 3)
const runs = []
for (let index = 0; index < RUNS; index += 1) runs.push(await run(index))
const { environment } = runs[0]
const median = (values) => {
  const sorted = values.filter((value) => value !== null).sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null
}
const NUMERIC = ['seconds', 'fps', 'frameMsP50', 'frameMsP95', 'framesOver33ms', 'longTasks', 'longestTaskMs', 'largestCameraStepCm', 'renderedFrames', 'heapMbAfter', 'heapMbDelta']
const results = runs[0].results.map((first) => {
  const all = runs.map(({ results: list }) => list.find(({ name }) => name === first.name))
  return {
    name: first.name,
    ...Object.fromEntries(NUMERIC.map((key) => [key, median(all.map((entry) => entry?.[key] ?? null))])),
    range: Object.fromEntries(['longestTaskMs', 'frameMsP95', 'largestCameraStepCm'].map((key) => [key, [Math.min(...all.map((entry) => entry[key] ?? 0)), Math.max(...all.map((entry) => entry[key] ?? 0))]])),
    cpu: { gcMs: median(all.map((entry) => entry.cpu.gcMs)), top: first.cpu.top }
  }
})
writeFileSync(`${OUT}/results.json`, JSON.stringify({ environment: { ...environment, runs: RUNS }, results, runs: runs.map(({ results: list }) => list) }, null, 2))

const cell = (value) => (value === null || value === undefined ? '—' : String(value))
const report = [
  `# Perf run ${LABEL}`,
  '',
  `Median of ${RUNS} runs (fresh browser each; profiles and traces from run 1) · commit \`${COMMIT}\` · ${environment.at} · ${environment.cpu} · GPU ${environment.gpu} · ${environment.browser} · ${environment.viewport} @${DPR}x · ${environment.items} items`,
  '',
  '| Scenario | fps (rAF) | p50 ms | p95 ms | frames > 33 ms | long tasks | longest ms (min–max) | max camera step cm | rendered frames | heap MB (Δ) | GC ms |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.map((r) => `| ${r.name} | ${r.fps} | ${cell(r.frameMsP50)} | ${cell(r.frameMsP95)} | ${r.framesOver33ms} | ${r.longTasks} | ${r.longestTaskMs} (${r.range.longestTaskMs.join('–')}) | ${r.largestCameraStepCm} | ${cell(r.renderedFrames)} | ${r.heapMbAfter} (${r.heapMbDelta >= 0 ? '+' : ''}${r.heapMbDelta}) | ${r.cpu.gcMs} |`),
  '',
  '## Top main-thread self time per scenario (V8 CPU profile)',
  '',
  ...results.flatMap((r) => [`### ${r.name}`, '', '| ms | function |', '| --- | --- |', ...r.cpu.top.map(({ fn, ms }) => `| ${ms} | \`${fn}\` |`), '']),
  '## Files',
  '',
  '- `cpu-<scenario>.cpuprofile.gz`: gunzip, then open in Chrome DevTools → Performance (or `chrome://inspect` → Profiler) or speedscope.app.',
  '- `trace-<scenario>.json.gz`: Chrome trace with frames, GPU and main-thread tasks; open in Chrome DevTools → Performance → Load profile, or ui.perfetto.dev.',
  '- `results.json`: the numbers above.'
].join('\n')
writeFileSync(`${OUT}/report.md`, `${report}\n`)

const index = `${PERF}/README.md`
const header = [
  '# Performance runs',
  '',
  'Every measurement of the editor\'s motion and loading, newest last. Each run folder has a report, raw numbers, V8 CPU profiles, Chrome traces, flame graphs and flame charts. Environment, scenarios, signals and how the improvement points were found: [METHOD.md](METHOD.md).',
  '',
  '| Run | Commit | Machine | Load longest stall | Switch longest stall | Focus max step | Idle rendered frames (3 s) |',
  '| --- | --- | --- | --- | --- | --- | --- |'
].join('\n')
const byName = Object.fromEntries(results.map((r) => [r.name, r]))
const row = `| [${LABEL}](${LABEL}/report.md) | \`${COMMIT}\` | ${environment.cpu} @${DPR}x, median of ${RUNS} | ${byName['load-layout'].longestTaskMs} ms | ${byName['switch-to-studio'].longestTaskMs} ms | ${byName['focus-room'].largestCameraStepCm} cm | ${cell(byName['idle-house'].renderedFrames)} |`
const existing = existsSync(index) ? readFileSync(index, 'utf8').trimEnd().split('\n').filter((line) => !line.startsWith(`| [${LABEL}]`)).join('\n') : header
writeFileSync(index, `${existing}\n${row}\n`)
execFileSync('node', ['demo/flamechart.mjs', OUT], { stdio: 'inherit' })
console.log(report.split('\n').slice(0, 14).join('\n'))
