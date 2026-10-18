import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const dir = 'demo/out/agent'
const work = `${dir}/edit`
mkdirSync(work, { recursive: true })
const prompt = readFileSync('docs/recordings/prompts/agent-01-reading-corner.txt', 'utf8').trim()
const image = (name) => `data:image/png;base64,${readFileSync(`${dir}/${name}`).toString('base64')}`

const recordingSecondsPerTimelineSecond = 1.1308
const toVideo = (timelineSeconds) => Math.max(0, timelineSeconds * recordingSecondsPerTimelineSecond - 1.16)
const segments = [
  { from: 0, to: 14, speed: 1, badge: 'Editor open · Claude Code attaches the roomfit MCP' },
  { from: 14, to: 87, speed: 12, badge: 'Agent → Comfy Cloud MCP: 2 product photos (Z-Image Turbo) · 12×' },
  { from: 87, to: 200.5, speed: 6, badge: 'Agent → roomfit add_product: photo → 3D on Comfy Cloud, fit to listed size · 6×' },
  { from: 200.5, to: 223.5, speed: 1.5, badge: 'Agent reads its screenshot, turns and moves the armchair · 1.5×' },
  { from: 223.5, to: 252, speed: 4, badge: 'Agent → roomfit render_room: eye-level render on Comfy Cloud · 4×' },
  { from: 252, to: 262, speed: 1, badge: 'Render opens in the editor' }
].map((segment) => ({ ...segment, from: toVideo(segment.from), to: toVideo(segment.to) }))

const page = await (await chromium.launch()).newPage({ viewport: { width: 1600, height: 900 } })
const shot = async (html, out, omitBackground = false) => {
  await page.setContent(`<body style="margin:0;width:1600px;height:900px;overflow:hidden;${omitBackground ? 'background:transparent' : 'background:#16181b'}">${html}</body>`)
  await page.screenshot({ path: out, omitBackground })
}
const card = (body) => `<div style="height:900px;display:grid;place-items:center;color:#fff;font:500 30px/1.5 system-ui,sans-serif"><div style="max-width:1300px">${body}</div></div>`

await shot(card(`<div style="opacity:.6;font-size:24px">One sentence to Claude Code, with two MCP servers: Comfy Cloud + roomfit</div>
  <div style="margin-top:24px;padding:28px 32px;border-radius:14px;background:#24272b;border:1px solid #3a3e44">“${prompt}”</div>`), `${work}/intro.png`)
await shot(card(`<div style="opacity:.6;font-size:24px;margin-bottom:20px">The two product photos the agent generated on Comfy Cloud</div>
  <div style="display:flex;gap:28px;justify-content:center"><img src="${image('armchair.png')}" style="height:560px;border-radius:12px"><img src="${image('floor-lamp.png')}" style="height:560px;border-radius:12px"></div>`), `${work}/photos.png`)
await shot(`<img src="${image('render.png')}" style="width:1600px;height:900px;object-fit:contain">`, `${work}/render.png`)
await shot(card(`<div style="font-size:40px;font-weight:700">6 min · 29 turns · $1.34 agent cost</div>
  <div style="margin-top:20px;opacity:.75">Comfy Cloud MCP: 2 photos · roomfit MCP: add_product ×2, screenshot ×3, rotate/move, render_room<br>No human input after the first sentence. Unedited run, sped up where marked.</div>`), `${work}/outro.png`)

for (const [i, s] of segments.entries()) {
  await shot(`<div style="position:fixed;left:24px;top:24px;padding:10px 18px;background:rgba(20,22,26,.85);color:#fff;font:600 26px/1.3 system-ui,sans-serif;border-radius:10px;border:1px solid rgba(255,255,255,.15)">${s.badge}</div>`, `${work}/badge${i}.png`, true)
}
await page.context().browser().close()

const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
const still = (png, seconds, out) => run(['-loop', '1', '-t', String(seconds), '-i', png, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', out])
still(`${work}/intro.png`, 5, `${work}/p0.mp4`)
const parts = [`${work}/p0.mp4`]
for (const [i, s] of segments.entries()) {
  const out = `${work}/s${i}.mp4`
  run(['-ss', String(s.from), '-to', String(s.to), '-i', `${dir}/raw.webm`, '-i', `${work}/badge${i}.png`,
    '-filter_complex', `[0:v]setpts=PTS/${s.speed},fps=25[v];[v][1:v]overlay=0:0,format=yuv420p`, '-an', '-c:v', 'libx264', out])
  parts.push(out)
  if (i === 1) { still(`${work}/photos.png`, 4, `${work}/photos.mp4`); parts.push(`${work}/photos.mp4`) }
}
still(`${work}/render.png`, 5, `${work}/render.mp4`)
still(`${work}/outro.png`, 5, `${work}/outro.mp4`)
parts.push(`${work}/render.mp4`, `${work}/outro.mp4`)
writeFileSync(`${work}/list.txt`, parts.map((p) => `file '${p.replace(`${work}/`, '')}'`).join('\n'))
run(['-f', 'concat', '-safe', '0', '-i', `${work}/list.txt`, '-c', 'copy', 'docs/recordings/media/roomfit-agent.mp4'])
