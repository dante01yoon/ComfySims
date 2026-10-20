import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

const RUN = process.argv[2]
if (!RUN) {
  console.error('usage: node demo/flamechart.mjs docs/portfolio/perf/<run>')
  process.exit(2)
}
const WIDTH = 1600
const ROW = 16
const MIN_PX = 0.4
const HIDDEN = new Set(['(root)', '(program)', '(idle)'])

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const label = ({ functionName, url, lineNumber }) => `${functionName || '(anonymous)'}${url ? ` ${url.split('/').pop().split('?')[0]}:${lineNumber + 1}` : ''}`
const colour = (name) => {
  if (name.startsWith('(garbage')) return '#9aa5b1'
  if (/texSubImage2D|texImage2D|bufferData|getProgramInfoLog|compileShader|readPixels|setSize/.test(name)) return '#e4572e'
  if (/GLTFLoader|parse|fit|Weld|simplif/i.test(name)) return '#f3a712'
  if (/react|jsx|reconciler|chunk-/i.test(name)) return '#29bf12'
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return `hsl(${200 + (Math.abs(hash) % 60)}, 55%, ${55 + (Math.abs(hash) % 20)}%)`
}

function stacks(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
  const parents = new Map()
  for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id)
  const stackOf = new Map()
  const resolve = (id) => {
    if (stackOf.has(id)) return stackOf.get(id)
    const node = nodes.get(id)
    const parent = parents.get(id)
    const name = label(node.callFrame)
    const stack = [...(parent === undefined ? [] : resolve(parent)), ...(HIDDEN.has(node.callFrame.functionName) ? [] : [name])]
    stackOf.set(id, stack)
    return stack
  }
  return profile.samples.map((id, index) => ({ stack: resolve(id), micros: profile.timeDeltas[index + 1] ?? profile.timeDeltas[index] ?? 0 }))
}

function svg(title, subtitle, rows, height, bars) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" font-family="Menlo, monospace" font-size="11">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="10" y="20" font-size="15" font-weight="bold">${escape(title)}</text>`,
    `<text x="10" y="38" fill="#555">${escape(subtitle)}</text>`,
    ...bars.map(({ x, y, w, name, ms }) => `<g><title>${escape(name)} — ${ms.toFixed(1)} ms</title><rect x="${x.toFixed(2)}" y="${y}" width="${Math.max(w, MIN_PX).toFixed(2)}" height="${ROW - 1}" fill="${colour(name)}" rx="1"/>${w > 60 ? `<text x="${(x + 3).toFixed(2)}" y="${y + 11}" fill="#111">${escape(name.slice(0, Math.floor(w / 7)))}</text>` : ''}</g>`),
    '</svg>'
  ].join('\n')
}

/** Aggregated flame graph: stacks merged by name, width = total time, root at the bottom. */
function flameGraph(samples, title) {
  const root = { name: 'all', micros: 0, children: new Map() }
  for (const { stack, micros } of samples) {
    root.micros += micros
    let node = root
    for (const name of stack) {
      if (!node.children.has(name)) node.children.set(name, { name, micros: 0, children: new Map() })
      node = node.children.get(name)
      node.micros += micros
    }
  }
  const bars = []
  let depth = 0
  const scale = (WIDTH - 20) / root.micros
  const walk = (node, x, level) => {
    depth = Math.max(depth, level)
    bars.push({ x, level, w: node.micros * scale, name: node.name, ms: node.micros / 1000 })
    let offset = x
    for (const child of [...node.children.values()].sort((a, b) => b.micros - a.micros)) {
      if (child.micros * scale >= MIN_PX) walk(child, offset, level + 1)
      offset += child.micros * scale
    }
  }
  walk(root, 10, 0)
  const height = 60 + (depth + 1) * ROW + 10
  return svg(title, `Flame graph: width = main-thread time (${(root.micros / 1000).toFixed(0)} ms sampled), stacks merged; red = GPU upload/shader/resize, amber = GLB parse/fit, green = React`, depth + 1, height, bars.map((bar) => ({ ...bar, y: height - 10 - (bar.level + 1) * ROW })))
}

/** Flame chart: time on the x axis, one column per sample, call stack downwards. */
function flameChart(samples, title) {
  const total = samples.reduce((sum, { micros }) => sum + micros, 0)
  const scale = (WIDTH - 20) / total
  const bars = []
  let depth = 0
  let open = []
  let t = 0
  const close = (from) => {
    for (const run of open.slice(from)) bars.push({ x: 10 + run.start * scale, w: (t - run.start) * scale, level: run.level, name: run.name, ms: (t - run.start) / 1000 })
    open = open.slice(0, from)
  }
  for (const { stack, micros } of samples) {
    let common = 0
    while (common < open.length && common < stack.length && open[common].name === stack[common]) common += 1
    close(common)
    for (let level = common; level < stack.length; level += 1) open.push({ name: stack[level], start: t, level })
    depth = Math.max(depth, stack.length)
    t += micros
  }
  close(0)
  const height = 60 + depth * ROW + 10
  return svg(title, `Flame chart: x = time (${(total / 1000).toFixed(0)} ms), y = call stack; wide red blocks are main-thread stalls`, depth, height, bars.filter((bar) => bar.w >= MIN_PX).map((bar) => ({ ...bar, y: 50 + bar.level * ROW })))
}

for (const file of readdirSync(RUN).filter((name) => name.startsWith('cpu-') && name.endsWith('.cpuprofile.gz'))) {
  const scenario = file.slice(4, -'.cpuprofile.gz'.length)
  const samples = stacks(JSON.parse(gunzipSync(readFileSync(join(RUN, file))).toString()))
  writeFileSync(join(RUN, `flamegraph-${scenario}.svg`), flameGraph(samples, `${RUN.split('/').pop()} · ${scenario}`))
  writeFileSync(join(RUN, `flamechart-${scenario}.svg`), flameChart(samples, `${RUN.split('/').pop()} · ${scenario}`))
  console.log(`${scenario}: flamegraph + flamechart`)
}
