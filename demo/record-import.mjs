import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

const OUT = 'demo/out/import-run'
const STORE_PAGE = 'https://www.ikea.com/us/en/p/kivik-sofa-tibbleby-beige-gray-s39440593/'
const EDITOR = 'http://127.0.0.1:5179/'
const layout = JSON.parse(readFileSync('demo/out/agent/final-state.json', 'utf8')).layout
layout.items = layout.items.filter((item) => item.id !== 'item-sofa')
mkdirSync(`${OUT}/video`, { recursive: true })
const started = Date.now()
const marks = []
const mark = (name, extra = {}) => { marks.push({ name, t: (Date.now() - started) / 1000, ...extra }); console.log(name, marks.at(-1).t) }
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: `${OUT}/video`, size: { width: 1600, height: 900 } } })
const page = await context.newPage()
const saveVideo = async () => {
  writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks, null, 2))
  const video = page.video()
  await context.close()
  renameSync(await video.path(), `${OUT}/raw.webm`)
  await browser.close()
}
try {

await page.goto(EDITOR)
await page.waitForFunction(() => typeof window.roomfit?.bookmarklet === 'function')
const bookmarklet = await page.evaluate(() => window.roomfit.bookmarklet())
mark('start')
await page.goto(STORE_PAGE, { waitUntil: 'domcontentloaded', timeout: 60_000 })
await page.waitForTimeout(5000)
const title = await page.title()
if (!/KIVIK/i.test(title)) { await page.screenshot({ path: `${OUT}/blocked.png` }); throw new Error(`store page did not load: ${title}`) }
mark('store-page', { title })
await page.mouse.wheel(0, 250)
await page.waitForTimeout(2500)
await page.evaluate(() => {
  window.open = (url) => { window.__comfysimsImport = url; return null }
  const bar = document.createElement('div')
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;height:38px;background:#2b2d31;display:flex;align-items:center;padding:0 12px;font:500 14px system-ui;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4)'
  const button = document.createElement('button')
  button.textContent = '★ Send to ComfySims'
  button.style.cssText = 'background:#3a3d43;color:#fff;border:0;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer'
  button.onclick = () => { window.__comfysimsClicked = true }
  bar.append(button)
  document.body.append(bar)
})
await page.waitForTimeout(1500)
await page.getByRole('button', { name: '★ Send to ComfySims' }).click()
await page.evaluate(decodeURIComponent(bookmarklet.replace(/^javascript:/, '')))
const importUrl = await page.waitForFunction(() => window.__comfysimsImport, null, { timeout: 15_000 }).then((handle) => handle.jsonValue())
mark('bookmarklet')
await page.waitForTimeout(800)
await page.goto(importUrl)
await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
await page.evaluate(() => window.roomfit.ready())
await page.getByText(/^Photo: /).waitFor({ timeout: 60_000 })
await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
await page.evaluate((value) => window.roomfit.load(value), layout)
await page.waitForFunction(async () => (await window.roomfit.scene()).every((item) => item.meshLoaded), null, { timeout: 300_000 })
await page.evaluate(() => { window.roomfit.setScene('reading'); window.roomfit.setView('editor'); window.roomfit.focusZone('living') })
mark('imported', { form: await page.evaluate(() => [...document.querySelectorAll('input')].filter((input) => input.type !== 'file' && input.value).map((input) => input.value)) })
await page.waitForTimeout(6000)
const before = await page.evaluate(() => window.roomfit.state().layout.items.map((item) => item.id))
await page.getByRole('button', { name: 'Generate 3D' }).click()
mark('generating')
await page.waitForFunction(() => window.roomfit.state().jobs.some((job) => job.kind === 'product' && ['done', 'failed'].includes(job.steps.at(-1)?.status)), null, { timeout: 900_000 })
const job = await page.evaluate(() => window.roomfit.state().jobs.find((entry) => entry.kind === 'product'))
mark('product-done', { status: job.steps.at(-1)?.status })
if (job.steps.at(-1)?.status !== 'done') throw new Error('product job failed')
await page.waitForTimeout(4000)
const itemId = await page.evaluate((ids) => window.roomfit.state().layout.items.find((item) => !ids.includes(item.id))?.id, before)
await page.evaluate((id) => { window.roomfit.selectItem(id); window.roomfit.setView('studio') }, itemId)
mark('placed', { itemId, asset: await page.evaluate((id) => { const s = window.roomfit.state(); const item = s.layout.items.find((entry) => entry.id === id); const asset = s.layout.assets.find((entry) => entry.id === item.assetId); return { name: asset.name, dimensions: asset.dimensions, fit: asset.fit, product: asset.product } }, itemId) })
await page.waitForTimeout(5000)
await page.getByLabel('Render style').selectOption('lived-in')
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Render this view' }).click()
mark('rendering')
await page.getByRole('region', { name: 'Jobs' }).getByRole('article', { name: /^Room render/ }).first().getByRole('button', { name: 'Open' }).waitFor({ timeout: 600_000 })
mark('render-done')
await page.waitForTimeout(1500)
await page.getByRole('region', { name: 'Jobs' }).getByRole('article', { name: /^Room render/ }).first().getByRole('button', { name: 'Open' }).click()
mark('render-open')
await page.waitForTimeout(7000)
await page.getByRole('button', { name: 'Close' }).first().click()
await page.evaluate(() => window.roomfit.setView('editor'))
await page.locator('summary', { hasText: 'Workflows' }).click()
const picker = page.getByLabel('Room render workflow')
await picker.scrollIntoViewIfNeeded()
mark('workflows')
await page.waitForTimeout(2500)
const renderOptions = await picker.locator('option').evaluateAll((options) => options.map((option) => ({ value: option.value, text: option.textContent })))
const current = await picker.inputValue()
const other = renderOptions.find((option) => option.value !== current)
if (other) { await picker.selectOption(other.value); await page.waitForTimeout(2500); await picker.selectOption(current); await page.waitForTimeout(1500) }
const modelSelects = page.locator('.workflow-choice select:not([aria-label$="workflow"])')
const modelIndex = (await modelSelects.evaluateAll((selects) => selects.map((select) => [...select.options].filter((option) => /\.(safetensors|gguf|ckpt|pt)$/.test(option.value)).length))).findIndex((count) => count > 1)
if (modelIndex >= 0) {
  const model = modelSelects.nth(modelIndex)
  await model.scrollIntoViewIfNeeded()
  const values = await model.locator('option').evaluateAll((options) => options.map((option) => option.value))
  const was = await model.inputValue()
  const next = values.find((value) => value !== was)
  if (next) { await model.selectOption(next); await page.waitForTimeout(2500); await model.selectOption(was); await page.waitForTimeout(1500) }
}
mark('workflow-choice', { renderOptions })
await page.getByRole('region', { name: 'Jobs' }).getByRole('article', { name: /^3D model/ }).first().getByRole('button', { name: 'Workflow' }).click()
await page.getByRole('dialog', { name: 'Workflow' }).waitFor()
mark('workflow-dialog')
await page.waitForTimeout(5000)
await page.getByRole('dialog', { name: 'Workflow' }).getByRole('button', { name: 'Close' }).click()
await page.waitForTimeout(1500)
mark('end')
} finally {
  await saveVideo()
}
console.log('recorded')
