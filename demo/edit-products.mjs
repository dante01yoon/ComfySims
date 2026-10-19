import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const dir = 'demo/out/products-run'
const work = `${dir}/edit`
mkdirSync(work, { recursive: true })
const marks = JSON.parse(readFileSync(`${dir}/marks.json`, 'utf8'))
const at = (name) => marks.find((entry) => entry.name === name).t
const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${dir}/raw.webm`]).toString())
const v = (seconds) => seconds * (duration / at('end'))
const image = (path) => `data:image/${path.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(path).toString('base64')}`

const page = await (await chromium.launch()).newPage({ viewport: { width: 1600, height: 900 } })
const shot = async (html, out, omitBackground = false) => {
  await page.setContent(`<body style="margin:0;width:1600px;height:900px;overflow:hidden;${omitBackground ? 'background:transparent' : 'background:#16181b'}">${html}</body>`)
  await page.screenshot({ path: out, omitBackground })
}
const caption = 'position:fixed;left:24px;top:24px;max-width:1500px;padding:10px 18px;background:rgba(20,22,26,.85);color:#fff;font:600 26px/1.3 system-ui,sans-serif;border-radius:10px;border:1px solid rgba(255,255,255,.15)'
const badge = async (text, i) => { await shot(`<div style="${caption}">${text}</div>`, `${work}/badge${i}.png`, true); return `${work}/badge${i}.png` }
const products = [['hulala-84-white.jpg', 'HULALA HOME 84″ · 213 × 84 × 76 cm'], ['baxton-sorrento.jpg', 'Baxton Studio Sorrento · 181 × 76 × 85 cm'], ['dopedio-71.jpg', 'DOPEDIO 71″ · 181 × 82 × 93 cm']]
await shot(`<div style="height:900px;display:grid;place-items:center;color:#fff;font:500 26px/1.4 system-ui,sans-serif;text-align:center"><div><div style="font-size:40px;font-weight:700;margin-bottom:28px">Three sofas from Amazon for one living-room wall</div><div style="display:flex;gap:24px">${products.map(([file, text]) => `<div style="width:460px"><img src="${image(`demo/out/products/${file}`)}" style="width:460px;height:340px;object-fit:contain;background:#fff;border-radius:12px"><div style="margin-top:10px">${text}</div></div>`).join('')}</div><div style="opacity:.65;margin-top:24px;font-size:22px">Listing photos and sizes as sold; the DOPEDIO listing has only lifestyle photos</div></div></div>`, `${work}/intro.png`)
await shot(`<img src="${image(`${dir}/store.png`)}" style="width:1600px;height:900px;object-fit:contain"><div style="${caption}">"Open product page" opened amazon.com/dp/B0C2P3KPTM — Amazon answered the automated recording browser with a bot check; in a normal browser it is the product page</div>`, `${work}/store.png`)

const run = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
const still = (png, seconds, out) => { run(['-loop', '1', '-t', String(seconds), '-i', png, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', out]); return out }
const clip = (from, to, speed, badgePath, out, crop) => {
  const view = crop ? `crop=${crop},scale=1600:900:force_original_aspect_ratio=decrease,pad=1600:900:(ow-iw)/2:(oh-ih)/2,` : ''
  run(['-ss', String(v(from)), '-to', String(v(to)), '-i', `${dir}/raw.webm`, '-i', badgePath, '-filter_complex', `[0:v]${view}setpts=PTS/${speed},fps=25[v];[v][1:v]overlay=0:0,format=yuv420p`, '-an', '-c:v', 'libx264', out])
  return out
}
const parts = [
  still(`${work}/intro.png`, 6, `${work}/p0.mp4`),
  clip(at('ready'), at('form-submitted') + 1, 1, await badge('Add product: photo, listed size, Amazon link, brand, store, label "living-wall candidates"', 1), `${work}/s1.mp4`),
  clip(at('form-submitted') + 1, at('all-done'), 8, await badge('Comfy Cloud: three photo → 3D jobs at once, each fitted to its listed size · 8×', 2), `${work}/s2.mp4`),
  clip(at('all-done'), at('all-done') + 3, 0.6, await badge('Unpacked in the garage at real size: leather 213 cm, grey 181 cm, beige 181 cm', 3), `${work}/s3.mp4`, '760:640:420:260'),
  clip(at('all-done') + 3, at('store-opened'), 1, await badge('Filter by label → place the HULALA where the old sofa stood → its product card', 4), `${work}/s4.mp4`),
  still(`${work}/store.png`, 6, `${work}/s5.mp4`)
]
writeFileSync(`${work}/list.txt`, parts.map((p) => `file '${p.replace(`${work}/`, '')}'`).join('\n'))
run(['-f', 'concat', '-safe', '0', '-i', `${work}/list.txt`, '-c', 'copy', `${dir}/roomfit-products.mp4`])
await page.context().browser().close()
