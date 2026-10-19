import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const data = (path, type = 'png') => `data:image/${type};base64,${readFileSync(path).toString('base64')}`
const icon = data('docs/brand/icon-512.png')
const corner = data('docs/recordings/media/agent-reading-corner.jpg', 'jpeg')
const exterior = data('demo/out/agent2/r-b.png')
const aerial = data('demo/out/agent2/r-a.png')
const C = { navy: '#1b2343', deep: '#121830', amber: '#efa263', lawn: '#71bf6f', cream: '#fce7c3', mint: '#8fe3d2' }
const font = '<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500&display=block" rel="stylesheet">'
const word = (size, light = false) => `<span style="font:700 ${size}px Fredoka;letter-spacing:-0.5px"><span style="color:${light ? C.navy : C.cream}">Comfy</span><span style="color:${C.amber}">Sims</span></span>`
const browser = await chromium.launch()
const shot = async (width, height, html, path, transparent = false) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.setContent(`<html><head>${font}</head><body style="margin:0;width:${width}px;height:${height}px;overflow:hidden;${transparent ? 'background:transparent' : ''}">${html}</body></html>`)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path, omitBackground: transparent })
  await page.close()
}
await shot(1200, 300, `<div style="height:300px;display:flex;align-items:center;gap:36px;padding:0 40px"><img src="${icon}" style="width:220px;height:220px">${word(136)}</div>`, 'docs/brand/wordmark-dark.png', true)
await shot(1200, 300, `<div style="height:300px;display:flex;align-items:center;gap:36px;padding:0 40px"><img src="${icon}" style="width:220px;height:220px">${word(136, true)}</div>`, 'docs/brand/wordmark-light.png', true)
const tagline = 'Real-size furniture, houses and floor plans — built and rendered with ComfyUI'
await shot(1280, 320, `<div style="height:320px;background:radial-gradient(circle at 18% 40%, #26305a 0%, ${C.navy} 45%, ${C.deep} 100%);display:flex;align-items:center;gap:34px;padding:0 56px;box-sizing:border-box">
  <img src="${icon}" style="width:200px;height:200px">
  <div style="flex:1"><div>${word(92)}</div><div style="font:500 24px Inter;color:${C.cream};opacity:.85;margin-top:8px;max-width:520px;line-height:1.35">${tagline}</div></div>
  <div style="display:flex;gap:12px;transform:rotate(-3deg)"><img src="${corner}" style="width:200px;height:156px;object-fit:cover;border-radius:12px;border:3px solid ${C.cream}"><img src="${exterior}" style="width:200px;height:156px;object-fit:cover;border-radius:12px;border:3px solid ${C.cream};margin-top:28px"></div>
</div>`, 'docs/brand/banner.png')
await shot(1280, 640, `<div style="height:640px;background:radial-gradient(circle at 25% 35%, #29335f 0%, ${C.navy} 50%, ${C.deep} 100%);display:grid;grid-template-columns:560px 1fr;align-items:center;padding:0 64px;box-sizing:border-box;gap:28px">
  <div><img src="${icon}" style="width:190px;height:190px"><div style="margin-top:22px">${word(96)}</div>
    <div style="font:500 26px Inter;color:${C.cream};opacity:.88;margin-top:14px;line-height:1.4">Product photo + listed size → exact-size 3D → your house → photoreal render. On ComfyUI and Comfy Cloud, driven by agents over MCP.</div>
    <div style="font:500 20px Inter;color:${C.mint};margin-top:22px">github.com/dante01yoon/ComfySims</div></div>
  <div style="position:relative;height:500px">
    <img src="${aerial}" style="position:absolute;right:0;top:0;width:520px;height:292px;object-fit:cover;border-radius:16px;border:4px solid ${C.cream};transform:rotate(2deg)">
    <img src="${corner}" style="position:absolute;left:0;bottom:0;width:360px;height:280px;object-fit:cover;border-radius:16px;border:4px solid ${C.cream};transform:rotate(-4deg)">
  </div>
</div>`, 'docs/brand/social-preview.png')
await browser.close()
