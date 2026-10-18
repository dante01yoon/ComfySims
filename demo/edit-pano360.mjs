import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const dir = 'demo/out/pano360'
const work = `${dir}/edit`
mkdirSync(work, { recursive: true })
const { marks } = JSON.parse(readFileSync(`${dir}/marks.json`, 'utf8'))
const at = (name) => marks.find((entry) => entry.name === name).t
const recordingSecondsPerWallSecond = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${dir}/raw.webm`]).toString()) / at('end')
const toVideo = (seconds) => seconds * recordingSecondsPerWallSecond
const image = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`

const segments = [
  { from: 0, to: at('generate-click') + 1, speed: 1, badge: 'Reading corner from the agent run · focus Bedroom · "360° view"' },
  { from: at('generate-click') + 1, to: at('viewer-open'), speed: 8, badge: 'Comfy Cloud: Qwen-Image 360 LoRA + depth ControlNet from the layout · 8×' },
  { from: at('viewer-open'), to: at('zoom'), speed: 1, badge: 'Look around: drag to turn, a full 360°' },
  { from: at('zoom'), to: at('end'), speed: 1, badge: 'Wheel: field of view 40–100° · Close' }
].map((segment) => ({ ...segment, from: toVideo(segment.from), to: toVideo(segment.to) }))

const page = await (await chromium.launch()).newPage({ viewport: { width: 1600, height: 900 } })
const shot = async (html, out, omitBackground = false) => {
  await page.setContent(`<body style="margin:0;width:1600px;height:900px;overflow:hidden;${omitBackground ? 'background:transparent' : 'background:#16181b'}">${html}</body>`)
  await page.screenshot({ path: out, omitBackground })
}
const caption = 'position:fixed;left:24px;top:24px;padding:10px 18px;background:rgba(20,22,26,.85);color:#fff;font:600 26px/1.3 system-ui,sans-serif;border-radius:10px;border:1px solid rgba(255,255,255,.15)'
await shot(`<div style="height:900px;display:grid;place-items:center;color:#fff;font:500 30px/1.5 system-ui,sans-serif;text-align:center"><div><div style="font-size:42px;font-weight:700">A 360° view that is still your room</div><div style="opacity:.7;margin-top:12px">roomfit renders a depth panorama of the layout; Comfy Cloud paints it as an equirectangular photo</div></div></div>`, `${work}/intro.png`)
await shot(`<img src="${image(`${dir}/pair.png`)}" style="display:block;margin:0 auto;height:900px"><div style="${caption}">Top: depth panorama from the layout · Bottom: Comfy Cloud result</div>`, `${work}/pair.png`)
for (const [i, s] of segments.entries()) await shot(`<div style="${caption}">${s.badge}</div>`, `${work}/badge${i}.png`, true)
await page.context().browser().close()

const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
const still = (png, seconds, out) => run(['-loop', '1', '-t', String(seconds), '-i', png, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', out])
still(`${work}/intro.png`, 4, `${work}/p0.mp4`)
const parts = [`${work}/p0.mp4`]
for (const [i, s] of segments.entries()) {
  const out = `${work}/s${i}.mp4`
  run(['-ss', String(s.from), '-to', String(s.to), '-i', `${dir}/raw.webm`, '-i', `${work}/badge${i}.png`,
    '-filter_complex', `[0:v]setpts=PTS/${s.speed},fps=25[v];[v][1:v]overlay=0:0,format=yuv420p`, '-an', '-c:v', 'libx264', out])
  parts.push(out)
  if (i === 1) { still(`${work}/pair.png`, 5, `${work}/pair.mp4`); parts.push(`${work}/pair.mp4`) }
}
writeFileSync(`${work}/list.txt`, parts.map((p) => `file '${p.replace(`${work}/`, '')}'`).join('\n'))
run(['-f', 'concat', '-safe', '0', '-i', `${work}/list.txt`, '-c', 'copy', 'docs/recordings/media/roomfit-360.mp4'])
