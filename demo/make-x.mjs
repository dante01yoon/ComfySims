import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const media = 'docs/recordings/media'
const out = 'demo/out/x'
const work = `${out}/work`
mkdirSync(work, { recursive: true })
const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
const normal = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1'
const encode = ['-c:v', 'libx264', '-profile:v', 'high', '-crf', '21', '-preset', 'medium', '-an']
const withSilentAudio = (input, output) => run(['-i', input, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output])

const page = await (await chromium.launch()).newPage({ viewport: { width: 1280, height: 720 } })
const card = async (title, subtitle, file) => {
  await page.setContent(`<body style="margin:0;width:1280px;height:720px;background:#16181b;display:grid;place-items:center;color:#fff;font-family:system-ui,sans-serif;text-align:center"><div><div style="font-size:58px;font-weight:800;letter-spacing:-1px">${title}</div><div style="font-size:26px;opacity:.75;margin-top:14px;max-width:1100px">${subtitle}</div></div></body>`)
  await page.screenshot({ path: file })
  return file
}
const still = async (title, subtitle, seconds, name) => {
  const png = await card(title, subtitle, `${work}/${name}.png`)
  run(['-loop', '1', '-t', String(seconds), '-i', png, '-vf', normal, ...encode, `${work}/${name}.mp4`])
  return `${work}/${name}.mp4`
}
const cut = (file, from, to, name, speed = 1) => {
  run(['-ss', String(from), '-to', String(to), '-i', `${media}/${file}`, '-vf', `setpts=PTS/${speed},${normal}`, ...encode, `${work}/${name}.mp4`])
  return `${work}/${name}.mp4`
}
const join = (parts, name) => {
  writeFileSync(`${work}/${name}.txt`, parts.map((part) => `file '${part.replace(`${work}/`, '')}'`).join('\n'))
  run(['-f', 'concat', '-safe', '0', '-i', `${work}/${name}.txt`, '-c', 'copy', `${work}/${name}-video.mp4`])
  withSilentAudio(`${work}/${name}-video.mp4`, `${out}/${name}.mp4`)
}

join([
  await still('Does this sofa fit?', 'roomfit: product photo + listed size → exact-size 3D → your house → photoreal render. Built on ComfyUI / Comfy Cloud.', 3, 'h-open'),
  cut('roomfit-place.mp4', 22, 40, 'h-place', 1.25),
  cut('roomfit-place.mp4', 51, 56, 'h-place-render'),
  cut('roomfit-products.mp4', 24, 40, 'h-products', 1.2),
  cut('roomfit-agent.mp4', 58, 70, 'h-agent', 1.2),
  cut('roomfit-agent.mp4', 83, 91, 'h-agent-render'),
  cut('roomfit-360.mp4', 20, 24, 'h-360-pair'),
  cut('roomfit-360.mp4', 26, 36, 'h-360-look', 1.2),
  cut('roomfit-studio.mp4', 0, 8, 'h-studio'),
  await still('github.com/dante01yoon/roomfit', 'open source (GPL-3.0) · ComfyUI node pack + editor + MCP server for agents', 4, 'h-close')
], 'x-00-roomfit-highlights')

const clips = [
  ['roomfit-place.mp4', 'x-01-make-and-place'],
  ['roomfit-products.mp4', 'x-02-real-products'],
  ['roomfit-agent.mp4', 'x-03-agent-furnishes'],
  ['roomfit-360.mp4', 'x-04-360-view'],
  ['roomfit-local-cloud.mp4', 'x-05-local-or-cloud'],
  ['roomfit-studio.mp4', 'x-06-home-studio']
]
for (const [file, name] of clips) {
  run(['-i', `${media}/${file}`, '-vf', normal, ...encode, `${work}/${name}-video.mp4`])
  withSilentAudio(`${work}/${name}-video.mp4`, `${out}/${name}.mp4`)
}
await page.context().browser().close()
