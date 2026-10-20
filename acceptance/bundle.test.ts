import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AC-129 the viewers are separate chunks and the first chunk stays small', () => {
  it('AC-129 production build: entry chunk ≤ 1,100 KB, 360° and 3D-photo viewers in their own chunks', () => {
    const out = mkdtempSync(join(tmpdir(), 'comfysims-build-'))
    execFileSync('pnpm', ['exec', 'vite', 'build', 'web', '--outDir', out, '--emptyOutDir'], { stdio: 'ignore' })
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    const entry = html.match(/src="\/?(assets\/[^"]+\.js)"/)?.[1]
    expect(entry).toBeDefined()
    expect(statSync(join(out, entry!)).size / 1024).toBeLessThanOrEqual(1100)
    const chunks = readdirSync(join(out, 'assets')).filter((file) => file.endsWith('.js'))
    expect(chunks.some((file) => file.startsWith('panorama-viewer-'))).toBe(true)
    expect(chunks.some((file) => file.startsWith('photo-viewer-'))).toBe(true)
  }, 120_000)
})
