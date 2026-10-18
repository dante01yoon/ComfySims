import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const cards = [
  ['sofa-photo.png', '1/4 · Product photo + its listed size: 200 × 90 × 85 cm', 'card1.png'],
  ['still-rot0.png', '2/4 · The AI 3D model came out 94 × 41 × 38. roomfit fits it to exactly 200 × 90 × 85.', 'card2.png'],
  ['demo-depth.png', '3/4 · Depth pass exported from the room layout', 'card4.png'],
  ['render.png', '4/4 · ComfyUI renders that exact layout (Z-Image Turbo + Fun ControlNet)', 'card5.png']
]
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
for (const [image, caption, out] of cards) {
  const src = `data:image/png;base64,${readFileSync(`demo/out/${image}`).toString('base64')}`
  await page.setContent(`<body style="margin:0;background:#1d1f22;width:1280px;height:720px;display:grid;place-items:center;overflow:hidden">
    <img src="${src}" style="max-width:1280px;max-height:720px;object-fit:contain">
    <div style="position:fixed;left:24px;bottom:24px;max-width:1100px;padding:10px 16px;background:rgba(0,0,0,.72);color:#fff;font:600 24px/1.35 system-ui,sans-serif;border-radius:8px">${caption}</div></body>`)
  await page.screenshot({ path: `demo/out/${out}` })
}
await browser.close()
