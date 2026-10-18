import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'

const OUT = process.env.DEMO_OUT ?? 'demo/out/agent'
const DONE = `${OUT}/agent-done`
const layout = JSON.parse(readFileSync('demo/out/house/furnished-layout.json', 'utf8'))
mkdirSync(`${OUT}/video`, { recursive: true })
rmSync(DONE, { force: true })
const started = Date.now()
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1600, height: 900 } } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate((l) => window.roomfit.load(l), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.setScene('reading') })
writeFileSync(`${OUT}/editor-ready`, String(Date.now()))
console.log('editor ready; waiting for the agent')
const timeline = []
let last = ''
while (!existsSync(DONE)) {
  const snapshot = await page.evaluate(() => {
    const s = window.roomfit.state()
    return JSON.stringify({ agent: s.agentConnected, focused: s.focusedZone, items: s.layout.items.length, jobs: s.jobs.map((job) => `${job.title}:${job.steps.at(-1)?.status}`), undo: s.undoLabels.slice(-3) })
  })
  if (snapshot !== last) { timeline.push({ t: (Date.now() - started) / 1000, ...JSON.parse(snapshot) }); last = snapshot }
  await page.waitForTimeout(500)
}
await page.waitForTimeout(5000)
writeFileSync(`${OUT}/timeline.json`, JSON.stringify(timeline, null, 2))
writeFileSync(`${OUT}/final-state.json`, JSON.stringify(await page.evaluate(() => window.roomfit.state()), null, 2))
const video = page.video()
await context.close()
renameSync(await video.path(), `${OUT}/raw.webm`)
await browser.close()
console.log('recorded')
