import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const dir = 'demo/out/drag'
const work = `${dir}/edit`
mkdirSync(work, { recursive: true })
const marks = JSON.parse(readFileSync(`${dir}/marks.json`, 'utf8'))
const at = (name) => marks.find((entry) => entry.name === name).t
const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${dir}/raw.webm`]).toString())
const v = (seconds) => seconds * (duration / at('end'))
const page = await (await chromium.launch()).newPage({ viewport: { width: 1600, height: 900 } })
const caption = 'position:fixed;left:24px;top:24px;max-width:1500px;padding:10px 18px;background:rgba(20,22,26,.85);color:#fff;font:600 26px/1.3 system-ui,sans-serif;border-radius:10px;border:1px solid rgba(255,255,255,.15)'
const shot = async (html, out, omitBackground) => {
  await page.setContent(`<body style="margin:0;width:1600px;height:900px;overflow:hidden;${omitBackground ? 'background:transparent' : 'background:#16181b'}">${html}</body>`)
  await page.screenshot({ path: out, omitBackground })
  return out
}
const segments = [
  [at('ready'), at('generate') + 1, 1, 'A product photo + its listed size: 68 × 78 × 80 cm'],
  [at('generate') + 1, at('placed-auto'), 8, 'Comfy Cloud makes the 3D model; roomfit fits it to 68 × 78 × 80 and finds a free spot · 8×'],
  [at('placed-auto'), at('rotated') + 1.5, 1, 'Drag it where you want it — next to the coffee table — and turn it to face the sofa (E)'],
  [at('rotated') + 1.5, at('render-done'), 2, 'Render this view → Comfy Cloud · 2×'],
  [at('render-done'), at('end'), 1, 'The chair is in the photo, where it was put']
]
await shot(`<div style="height:900px;display:grid;place-items:center;color:#fff;font:500 30px/1.5 system-ui,sans-serif;text-align:center"><div><div style="font-size:42px;font-weight:700">Make a piece of furniture, put it exactly where you want</div><div style="opacity:.7;margin-top:12px">photo → exact-size 3D → drag into place → photoreal render</div></div></div>`, `${work}/intro.png`)
const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
run(['-loop', '1', '-t', '4', '-i', `${work}/intro.png`, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', `${work}/p0.mp4`])
const parts = [`${work}/p0.mp4`]
for (const [i, [from, to, speed, text]] of segments.entries()) {
  const badge = await shot(`<div style="${caption}">${text}</div>`, `${work}/b${i}.png`, true)
  run(['-ss', String(v(from)), '-to', String(v(to)), '-i', `${dir}/raw.webm`, '-i', badge, '-filter_complex', `[0:v]setpts=PTS/${speed},fps=25[v];[v][1:v]overlay=0:0,format=yuv420p`, '-an', '-c:v', 'libx264', `${work}/s${i}.mp4`])
  parts.push(`${work}/s${i}.mp4`)
}
await page.context().browser().close()
writeFileSync(`${work}/list.txt`, parts.map((p) => `file '${p.replace(`${work}/`, '')}'`).join('\n'))
run(['-f', 'concat', '-safe', '0', '-i', `${work}/list.txt`, '-c', 'copy', 'docs/recordings/media/roomfit-place.mp4'])
