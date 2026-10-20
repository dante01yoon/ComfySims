import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const LABEL = process.env.MOTION_LABEL ?? `${new Date().toISOString().slice(0, 10)}-run`
const OUT = `docs/portfolio/perf/${LABEL}`
const build = mkdtempSync(join(tmpdir(), 'comfysims-bundle-'))
mkdirSync(OUT, { recursive: true })

execFileSync('pnpm', ['exec', 'vite', 'build', 'web', '--sourcemap', '--outDir', build, '--emptyOutDir'], { stdio: 'ignore' })
const assets = join(build, 'assets')
const chunks = readdirSync(assets).filter((file) => file.endsWith('.js'))
const files = chunks.map((file) => {
  const bytes = statSync(join(assets, file)).size
  return { file, kb: Math.round(bytes / 1024), gzipKb: Math.round(gzipSync(readFileSync(join(assets, file))).length / 1024) }
})
const explored = JSON.parse(execFileSync('pnpm', ['dlx', 'source-map-explorer@2.5.3', ...chunks.map((file) => resolve(assets, file)), '--json', '--no-border-checks'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
const byPackage = new Map()
for (const result of explored.results) {
  for (const [source, { size }] of Object.entries(result.files)) {
    const match = source.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/)
    const name = match ? match[1] : source.startsWith('[') ? source : 'app code'
    byPackage.set(name, (byPackage.get(name) ?? 0) + size)
  }
}
const packages = [...byPackage].sort((a, b) => b[1] - a[1]).map(([name, bytes]) => ({ name, kb: Math.round(bytes / 1024) }))
const total = files.reduce((sum, file) => sum + file.kb, 0)
const totalGzip = files.reduce((sum, file) => sum + file.gzipKb, 0)
writeFileSync(`${OUT}/bundle.json`, JSON.stringify({ files, packages }, null, 2))
writeFileSync(`${OUT}/bundle.md`, [
  `# Bundle ${LABEL}`,
  '',
  `${files.length} JS chunk(s), ${total} KB (${totalGzip} KB gzip).`,
  '',
  '| Chunk | KB | gzip KB |',
  '| --- | --- | --- |',
  ...files.map((file) => `| ${file.file} | ${file.kb} | ${file.gzipKb} |`),
  '',
  '## By package (minified bytes, source-map-explorer)',
  '',
  '| Package | KB |',
  '| --- | --- |',
  ...packages.slice(0, 20).map((entry) => `| ${entry.name} | ${entry.kb} |`),
  ''
].join('\n'))
console.log(`bundle: ${files.length} chunks, ${total} KB (${totalGzip} KB gzip); top: ${packages.slice(0, 5).map((p) => `${p.name} ${p.kb} KB`).join(', ')}`)
