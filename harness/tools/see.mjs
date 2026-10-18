import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')).map(([key, value]) => [key, value ?? 'true']))
if (args.help) {
  console.log('pnpm see --layout=fixtures/layouts/demo-house.json [--view=studio] [--focus=bedroom] [--scene=evening] [--size=1600x900] [--out=.harness/see/shot.png]')
  process.exit(0)
}
const port = 5189
const [width, height] = (args.size ?? '1600x900').split('x').map(Number)
const out = args.out ?? '.harness/see/shot.png'
mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true })

const server = spawn('pnpm', ['exec', 'vite', 'web', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
try {
  for (let i = 0; i < 60; i++) {
    if (await fetch(`http://127.0.0.1:${port}/`).then((response) => response.ok).catch(() => false)) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  if (args.layout) await page.evaluate((layout) => window.roomfit.load(layout), JSON.parse(readFileSync(args.layout, 'utf8')))
  if (args.view) await page.evaluate((view) => window.roomfit.setView(view), args.view)
  if (args.focus) await page.evaluate((zone) => window.roomfit.focusZone(zone), args.focus)
  if (args.scene) await page.evaluate((scene) => window.roomfit.setScene(scene), args.scene)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: out })
  console.log(JSON.stringify({ screenshot: out, consoleErrors: errors.slice(0, 10), state: await page.evaluate(() => { const s = window.roomfit.state(); return { view: s.view, focusedZone: s.focusedZone, items: s.layout.items.length, outOfBounds: s.outOfBounds, collisions: s.collisions } }) }, null, 2))
  await browser.close()
} finally {
  server.kill()
}
