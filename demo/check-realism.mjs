import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const out = 'demo/out/realism-app'
mkdirSync(out, { recursive: true })
const layout = JSON.parse(readFileSync('demo/out/agent/final-state.json', 'utf8')).layout
const browser = await chromium.launch({ args: ['--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
const save = async (url, name) => {
  const bytes = await page.evaluate(async (u) => { const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s) }, url)
  writeFileSync(`${out}/${name}.png`, Buffer.from(bytes, 'base64'))
}
await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.setScene('evening'); window.roomfit.focusZone('living') })
for (const style of ['as-built', 'lived-in']) {
  await page.evaluate((s) => window.roomfit.setRenderStyle(s), style)
  await page.getByRole('button', { name: 'Render this view' }).click()
  await page.waitForFunction((n) => window.roomfit.state().jobs.filter((j) => j.kind === 'render' && j.steps.at(-1)?.status === 'done').length >= n, style === 'as-built' ? 1 : 2, { timeout: 300_000 })
  const job = await page.evaluate(() => window.roomfit.state().jobs.filter((j) => j.kind === 'render').at(-1))
  await save(job.result.image, `living-${style}`)
  await page.keyboard.press('Escape')
  console.log(style, 'done')
}
await page.evaluate(() => window.roomfit.focusZone('bedroom'))
await page.getByRole('button', { name: '360° view' }).click()
await page.waitForFunction(() => window.roomfit.state().jobs.some((j) => j.kind === 'pano360' && j.steps.at(-1)?.status === 'done'), null, { timeout: 600_000 })
await save((await page.evaluate(() => window.roomfit.state().jobs.find((j) => j.kind === 'pano360'))).result.image, 'bedroom-360-lived-in')
await browser.close()
