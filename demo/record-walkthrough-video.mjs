import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'

const OUT = process.env.DEMO_OUT ?? 'demo/out/walkthrough-video'
const SIZE = { width: 1600, height: 900 }
const ROOMS = (process.env.ROOMS ?? 'Living,Bedroom').split(',')
const layout = JSON.parse(readFileSync('demo/out/house/furnished-layout.json', 'utf8'))
mkdirSync(OUT, { recursive: true })
const glbs = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  try { response.end(readFileSync(`demo/out${decodeURIComponent(new URL(request.url, 'http://x').pathname)}`)) } catch { response.statusCode = 404; response.end() }
}).listen(5180)

const browser = await chromium.launch({ channel: process.env.CHANNEL ?? 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] })
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, acceptDownloads: true })
const page = await context.newPage()
await page.goto('http://127.0.0.1:5179/')
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => { window.roomfit.setView('studio'); window.roomfit.setScene('reading') })
await page.waitForTimeout(2000)

const timeline = []
const mark = (event) => timeline.push({ event, at: Date.now() })
mark('ready')
for (const room of ROOMS) {
  await page.getByRole('button', { name: room, exact: true }).click()
  await page.waitForTimeout(1500)
  mark(`${room}: click`)
  await page.getByRole('button', { name: 'Walkthrough video' }).click()
  const dialog = page.getByRole('dialog', { name: 'Walkthrough' })
  await dialog.waitFor({ state: 'visible', timeout: 600_000 })
  mark(`${room}: viewer`)
  await page.waitForTimeout(10_000)
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download' }).click()
  const file = await download
  await file.saveAs(`${OUT}/${file.suggestedFilename()}`)
  mark(`${room}: downloaded ${file.suggestedFilename()}`)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(1500)
}
const jobs = await page.evaluate(() => window.roomfit.state().jobs.filter((job) => job.kind === 'walkthrough').map(({ id, title, steps }) => ({ id, title, steps })))
writeFileSync(`${OUT}/run.json`, JSON.stringify({ timeline, jobs, workflows: await page.evaluate((ids) => ids.map((id) => window.roomfit.jobWorkflow(id)?.file), jobs.map((job) => job.id)) }, null, 2))
await context.close()
await browser.close()
glbs.close()
