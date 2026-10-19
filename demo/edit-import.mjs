import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const dir = 'demo/out/import-run'
const work = `${dir}/edit`
mkdirSync(work, { recursive: true })
const marks = JSON.parse(readFileSync(`${dir}/marks.json`, 'utf8'))
const at = (name) => marks.find((entry) => entry.name === name).t
const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${dir}/raw.webm`]).toString())
const v = (seconds) => seconds * (duration / at('end'))
const image = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`
const placed = marks.find((entry) => entry.name === 'placed').asset
const size = `${placed.dimensions.width} × ${placed.dimensions.depth} × ${placed.dimensions.height} cm`

const page = await (await chromium.launch()).newPage({ viewport: { width: 1600, height: 900 } })
const shot = async (html, out, omitBackground = false) => {
  await page.setContent(`<body style="margin:0;width:1600px;height:900px;overflow:hidden;${omitBackground ? 'background:transparent' : 'background:#16181b'}">${html}</body>`)
  await page.screenshot({ path: out, omitBackground })
}
const caption = 'position:fixed;left:24px;bottom:24px;max-width:1500px;padding:10px 18px;background:rgba(20,22,26,.88);color:#fff;font:600 26px/1.3 system-ui,sans-serif;border-radius:10px;border:1px solid rgba(255,255,255,.15)'
const badge = async (text, i) => { await shot(`<div style="${caption}">${text}</div>`, `${work}/badge${i}.png`, true); return `${work}/badge${i}.png` }
const card = (title, subtitle) => `<div style="height:900px;display:grid;place-items:center;color:#fff;font-family:system-ui,sans-serif;text-align:center"><div><div style="font-size:64px;font-weight:800;letter-spacing:-1px">${title}</div><div style="font-size:30px;opacity:.75;margin-top:18px">${subtitle}</div></div></div>`
await shot(card('Found a sofa online?', 'Send the store page to ComfySims — it lands in your house at its real size'), `${work}/intro.png`)
const pair = ['living-as-built', 'living-lived-in'].map((name) => `<div><img src="${image(`demo/out/realism-app/${name}.png`)}" style="width:740px;height:576px;object-fit:cover;border-radius:12px"><div style="margin-top:12px">${name === 'living-as-built' ? 'As built' : 'Lived-in (default)'}</div></div>`).join('')
await shot(`<div style="height:900px;display:grid;place-items:center;color:#fff;font:500 28px/1.4 system-ui,sans-serif;text-align:center"><div><div style="font-size:42px;font-weight:700;margin-bottom:26px">Render style: renders that look like a real home, not a white show flat</div><div style="display:flex;gap:28px">${pair}</div><div style="opacity:.6;margin-top:18px;font-size:22px">Same layout and depth, both rendered on Comfy Cloud</div></div></div>`, `${work}/compare.png`)
await shot(card('github.com/dante01yoon/ComfySims', 'open source · ComfyUI node pack + editor + MCP server for agents'), `${work}/outro.png`)

const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
const still = (png, seconds, out) => { run(['-loop', '1', '-t', String(seconds), '-i', png, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', out]); return out }
const clip = (from, to, speed, badgePath, out) => {
  run(['-ss', String(v(from)), '-to', String(v(to)), '-i', `${dir}/raw.webm`, '-i', badgePath, '-filter_complex', `[0:v]setpts=PTS/${speed},fps=25[v];[v][1:v]overlay=0:0,format=yuv420p`, '-an', '-c:v', 'libx264', out])
  return out
}
const parts = [
  still(`${work}/intro.png`, 3.5, `${work}/p0.mp4`),
  clip(at('store-page'), at('bookmarklet') + 1, 1, await badge('A real IKEA product page → click the <b>Send to ComfySims</b> bookmarklet', 1), `${work}/s1.mp4`),
  clip(at('imported'), at('generating') + 1, 1, await badge(`Name, size ${size}, brand, link and photo filled in from the page`, 2), `${work}/s2.mp4`),
  clip(at('generating') + 1, at('product-done'), 12, await badge('Comfy Cloud: product photo → 3D, fitted to the listed size · 12×', 3), `${work}/s3.mp4`),
  clip(at('product-done'), at('rendering') + 1, 1.2, await badge('In the living room at real size, with its product card and store link', 4), `${work}/s4.mp4`),
  clip(at('rendering') + 1, at('render-done'), 6, await badge('Render this view on Comfy Cloud · style: Lived-in · 6×', 5), `${work}/s5.mp4`),
  clip(at('render-open'), at('render-open') + 6, 1, await badge('The render, from the layout\'s depth', 6), `${work}/s6.mp4`),
  still(`${work}/compare.png`, 6, `${work}/s7.mp4`),
  clip(at('workflows'), at('end'), 1.2, await badge('Pick the workflow and model for each job — and see exactly what a job ran', 8), `${work}/s8.mp4`),
  still(`${work}/outro.png`, 3.5, `${work}/p9.mp4`)
]
writeFileSync(`${work}/list.txt`, parts.map((p) => `file '${p.replace(`${work}/`, '')}'`).join('\n'))
run(['-f', 'concat', '-safe', '0', '-i', `${work}/list.txt`, '-c', 'copy', 'docs/recordings/media/roomfit-import.mp4'])
await page.context().browser().close()
