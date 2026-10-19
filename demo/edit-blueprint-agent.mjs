import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const dir = 'demo/out/agent2'
const work = `${dir}/edit`
mkdirSync(work, { recursive: true })
const anchors = [[0, 0], [32.3, 34.8], [53.4, 57.68], [107.4, 116.36], [123.0, 134.32], [143.0, 156.52], [160, 180.1]]
const v = (t) => {
  const i = Math.max(1, anchors.findIndex(([at]) => at >= t))
  const [a, va] = anchors[i - 1]
  const [b, vb] = anchors[i] ?? anchors.at(-1)
  return va + ((t - a) / (b - a || 1)) * (vb - va)
}
const image = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`
const prompt = readFileSync('docs/recordings/prompts/agent-02-blueprint-house.en.txt', 'utf8').trim()
const segments = [
  [0, 32.3, 6, 'Claude reads the floor plan image (12 × 9 m, 1:100) · 6×'],
  [32.3, 53.4, 3, 'roomfit MCP set_blueprint: the plan under the editor at 0.909 cm/px · 3×'],
  [53.4, 106.2, 4, 'set_house_plan: 8 walls, 11 openings, 5 rooms — checked with screenshots over the underlay · 4×'],
  [106.2, 123.5, 2, 'set_site: 22 × 19 m of lawn → render_exterior aerial on Comfy Cloud · 2×'],
  [123.5, 146, 2, 'render_exterior street · 2×']
]
const page = await (await chromium.launch()).newPage({ viewport: { width: 1600, height: 900 } })
const caption = 'position:fixed;left:24px;top:24px;max-width:1500px;padding:10px 18px;background:rgba(20,22,26,.85);color:#fff;font:600 26px/1.3 system-ui,sans-serif;border-radius:10px;border:1px solid rgba(255,255,255,.15)'
const shot = async (html, out, omitBackground) => {
  await page.setContent(`<body style="margin:0;width:1600px;height:900px;overflow:hidden;${omitBackground ? 'background:transparent' : 'background:#16181b'}">${html}</body>`)
  await page.screenshot({ path: out, omitBackground })
  return out
}
await shot(`<div style="height:900px;display:flex;gap:40px;align-items:center;justify-content:center;color:#fff;font:500 26px/1.45 system-ui,sans-serif"><img src="${image('demo/out/blueprint-run/floor-plan.png')}" style="height:640px;border-radius:10px"><div style="max-width:620px"><div style="opacity:.6;font-size:22px">One sentence to Claude Code with the roomfit MCP + Comfy Cloud MCP (prompt translated from Korean)</div><div style="margin-top:18px;padding:22px 26px;border-radius:12px;background:#24272b;border:1px solid #3a3e44">“${prompt}”</div></div></div>`, `${work}/intro.png`)
await shot(`<div style="height:900px;display:grid;place-items:center;color:#fff;font:500 26px/1.4 system-ui,sans-serif;text-align:center"><div><div style="display:flex;gap:16px;justify-content:center"><img src="${image(`${dir}/r-a.png`)}" style="width:760px;border-radius:10px"><img src="${image(`${dir}/r-b.png`)}" style="width:760px;border-radius:10px"></div><div style="margin-top:18px">Aerial and street exterior renders of the house built from the plan</div></div></div>`, `${work}/renders.png`)
await shot(`<div style="height:900px;display:grid;place-items:center;color:#fff;font:500 28px/1.5 system-ui,sans-serif;text-align:center"><div><div style="font-size:40px;font-weight:700">Plan read exactly: 0 cm error</div><div style="opacity:.75;margin-top:14px">pnpm plan-diff against the drawing's source — walls 8/8, openings 11/11, rooms 5/5<br>2 min 34 s · 31 turns · $1.29 agent cost · no human input after the sentence</div></div></div>`, `${work}/outro.png`)
const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
const still = (png, seconds, out) => { run(['-loop', '1', '-t', String(seconds), '-i', png, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', out]); return out }
const parts = [still(`${work}/intro.png`, 6, `${work}/p0.mp4`)]
for (const [i, [from, to, speed, text]] of segments.entries()) {
  const badge = await shot(`<div style="${caption}">${text}</div>`, `${work}/b${i}.png`, true)
  run(['-ss', String(v(from)), '-to', String(v(to)), '-i', `${dir}/raw.webm`, '-i', badge, '-filter_complex', `[0:v]setpts=PTS/${speed},fps=25[v];[v][1:v]overlay=0:0,format=yuv420p`, '-an', '-c:v', 'libx264', `${work}/s${i}.mp4`])
  parts.push(`${work}/s${i}.mp4`)
}
parts.push(still(`${work}/renders.png`, 6, `${work}/renders.mp4`), still(`${work}/outro.png`, 5, `${work}/outro.mp4`))
await page.context().browser().close()
writeFileSync(`${work}/list.txt`, parts.map((p) => `file '${p.replace(`${work}/`, '')}'`).join('\n'))
run(['-f', 'concat', '-safe', '0', '-i', `${work}/list.txt`, '-c', 'copy', 'docs/recordings/media/roomfit-blueprint.mp4'])
