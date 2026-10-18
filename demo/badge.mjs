import { chromium } from '@playwright/test'

const [text, out] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.setContent(`<body style="margin:0;background:transparent"><div style="position:fixed;left:24px;top:24px;padding:10px 18px;background:rgba(20,22,26,.85);color:#fff;font:600 26px/1.3 system-ui,sans-serif;border-radius:10px;border:1px solid rgba(255,255,255,.15)">${text}</div></body>`)
await page.screenshot({ path: out, omitBackground: true })
await browser.close()
