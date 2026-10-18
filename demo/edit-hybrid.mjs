import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const dir = 'demo/out/hybrid'
const work = `${dir}/edit`
mkdirSync(work, { recursive: true })
const marks = JSON.parse(readFileSync(`${dir}/marks.json`, 'utf8'))
const at = (name) => marks.find((entry) => entry.name === name).t
const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${dir}/raw.webm`]).toString())
const toVideo = (seconds) => seconds * (duration / at('end'))

const segments = [
  { from: at('ready') + 0.5, to: at('cloud-render-click'), badge: 'Backend chip: Cloud · ready' },
  { from: at('cloud-render-click'), to: at('switched-local') - 1.5, badge: 'Render this view → Comfy Cloud (Z-Image Turbo + ControlNet)' },
  { from: at('switched-local') - 1.5, to: at('local-photo3d-click'), badge: 'Use Local: only MoGe is installed → render, 3D model, 360° marked unavailable' },
  { from: at('local-photo3d-click'), to: at('workflows'), badge: 'View as 3D photo → local ComfyUI on this Mac (MoGe, MPS)' },
  { from: at('workflows'), to: at('end'), badge: 'Workflow dialog: the exact graph each job ran, and where' }
].map((segment) => ({ ...segment, from: toVideo(segment.from), to: toVideo(segment.to) }))

const page = await (await chromium.launch()).newPage({ viewport: { width: 1600, height: 900 } })
const shot = async (html, out, omitBackground = false) => {
  await page.setContent(`<body style="margin:0;width:1600px;height:900px;overflow:hidden;${omitBackground ? 'background:transparent' : 'background:#16181b'}">${html}</body>`)
  await page.screenshot({ path: out, omitBackground })
}
const caption = 'position:fixed;left:24px;top:24px;padding:10px 18px;background:rgba(20,22,26,.85);color:#fff;font:600 26px/1.3 system-ui,sans-serif;border-radius:10px;border:1px solid rgba(255,255,255,.15)'
await shot(`<div style="height:900px;display:grid;place-items:center;color:#fff;font:500 30px/1.5 system-ui,sans-serif;text-align:center"><div><div style="font-size:42px;font-weight:700">Local or Cloud, per job</div><div style="opacity:.7;margin-top:12px">Render on Comfy Cloud, 3D photo on the ComfyUI running on this Mac — one editor, no restart</div></div></div>`, `${work}/intro.png`)
for (const [i, s] of segments.entries()) await shot(`<div style="${caption}">${s.badge}</div>`, `${work}/badge${i}.png`, true)
await page.context().browser().close()

const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
run(['-loop', '1', '-t', '4', '-i', `${work}/intro.png`, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', `${work}/p0.mp4`])
const parts = [`${work}/p0.mp4`]
for (const [i, s] of segments.entries()) {
  const out = `${work}/s${i}.mp4`
  run(['-ss', String(s.from), '-to', String(s.to), '-i', `${dir}/raw.webm`, '-i', `${work}/badge${i}.png`, '-filter_complex', '[0:v]fps=25[v];[v][1:v]overlay=0:0,format=yuv420p', '-an', '-c:v', 'libx264', out])
  parts.push(out)
}
writeFileSync(`${work}/list.txt`, parts.map((p) => `file '${p.replace(`${work}/`, '')}'`).join('\n'))
run(['-f', 'concat', '-safe', '0', '-i', `${work}/list.txt`, '-c', 'copy', 'docs/recordings/media/roomfit-local-cloud.mp4'])
