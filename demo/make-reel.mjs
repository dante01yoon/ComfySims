import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const work = 'demo/out/reel'
mkdirSync(work, { recursive: true })
const media = 'docs/recordings/media'
const chapters = [
  ['roomfit-studio.mp4', 'Home studio', '15 pieces generated on Comfy Cloud from product photos'],
  ['roomfit-agent.mp4', 'An agent furnishes a room', 'Claude Code + Comfy Cloud MCP + roomfit MCP, one sentence'],
  ['roomfit-360.mp4', '360° view of your layout', 'depth panorama → Qwen-Image 360 on Comfy Cloud'],
  ['roomfit-local-cloud.mp4', 'Local or Cloud, per job', 'render on Cloud, 3D photo on this Mac'],
  ['roomfit-products.mp4', 'Shop from real listings', 'three Amazon sofas, real sizes, store links']
]
const page = await (await chromium.launch()).newPage({ viewport: { width: 1600, height: 900 } })
const card = async (title, subtitle, out) => {
  await page.setContent(`<body style="margin:0;width:1600px;height:900px;background:#16181b;display:grid;place-items:center;color:#fff;font-family:system-ui,sans-serif;text-align:center"><div><div style="font-size:64px;font-weight:800;letter-spacing:-1px">${title}</div><div style="font-size:28px;opacity:.7;margin-top:16px">${subtitle}</div></div></body>`)
  await page.screenshot({ path: out })
}
await card('roomfit', 'Does this sofa fit? Product photo + listed size → exact-size 3D → your house → photoreal render', `${work}/open.png`)
for (const [i, [, title, subtitle]] of chapters.entries()) await card(`${i + 1}. ${title}`, subtitle, `${work}/c${i}.png`)
await card('github.com/dante01yoon/roomfit', 'GPL-3.0 · built spec-first with Claude Code and a harness that grades every change', `${work}/close.png`)
await page.context().browser().close()

const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
const normal = 'scale=1600:900:force_original_aspect_ratio=decrease,pad=1600:900:(ow-iw)/2:(oh-ih)/2,fps=25,format=yuv420p,setsar=1'
const encode = ['-c:v', 'libx264', '-crf', '24', '-preset', 'veryfast', '-an']
const still = (png, seconds, out) => { run(['-loop', '1', '-t', String(seconds), '-i', png, '-vf', normal, ...encode, out]); return out }
const video = (file, out) => { run(['-i', file, '-vf', normal, ...encode, out]); return out }
const parts = [still(`${work}/open.png`, 4, `${work}/p-open.mp4`)]
chapters.forEach(([file], i) => {
  parts.push(still(`${work}/c${i}.png`, 2.5, `${work}/p-c${i}.mp4`))
  parts.push(video(`${media}/${file}`, `${work}/p-m${i}.mp4`))
})
parts.push(still(`${work}/close.png`, 4, `${work}/p-close.mp4`))
writeFileSync(`${work}/list.txt`, parts.map((part) => `file '${part.replace(`${work}/`, '')}'`).join('\n'))
run(['-f', 'concat', '-safe', '0', '-i', `${work}/list.txt`, '-c', 'copy', '-movflags', '+faststart', `${media}/roomfit-reel.mp4`])
