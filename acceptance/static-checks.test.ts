import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { CHECKS, repoFiles, runStaticChecks } from '../harness/tools/static-checks.ts'
import type { Files } from '../harness/tools/static-checks.ts'

const ROOT = resolve('.')
const bin = (name: string) => join(ROOT, 'node_modules/.bin', name)
const run = (command: string, args: string[], cwd = ROOT) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}
const plant = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'comfysims-lint-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  return dir
}
const memoryFiles = (files: Record<string, string>): Files => ({ list: () => Object.keys(files), read: (path) => files[path] ?? '' })
const fakeKey = () => `comfyui-${'k3Y'.repeat(9)}`

describe('AC-110 oxlint guards the code', () => {
  it('AC-110 pnpm lint passes on the repo', () => {
    const { status, output } = run('pnpm', ['-s', 'lint'])
    expect(status, output).toBe(0)
  })

  it.for([
    ['an inline type import', 'probe.ts', "import { type Dirent, readdirSync } from 'node:fs'\nexport const entries: Dirent[] = readdirSync('.', { withFileTypes: true })\n", 'consistent-type-specifier-style'],
    ['a focused test', 'probe.test.ts', "import { expect, it } from 'vitest'\nit.only('runs alone', () => expect(1).toBe(1))\n", 'no-focused-tests'],
    ['an explicit any', 'probe.ts', 'export const loose = (value: any) => value\n', 'no-explicit-any']
  ])('AC-110 rejects %s', ([, file, source, rule]) => {
    const dir = plant({ [file as string]: source as string })
    const { status, output } = run(bin('oxlint'), ['-c', join(ROOT, '.oxlintrc.json'), '--deny-warnings', dir])
    expect(status).not.toBe(0)
    expect(output).toContain(rule)
  })
})

describe('AC-111 no dead code and no import across layers', () => {
  it('AC-111 pnpm knip passes on the repo', () => {
    const { status, output } = run('pnpm', ['-s', 'knip'])
    expect(status, output).toBe(0)
  }, 60_000)

  it('AC-111 pnpm deps:check passes on the repo', () => {
    const { status, output } = run('pnpm', ['-s', 'deps:check'])
    expect(status, output).toBe(0)
  }, 60_000)

  it('AC-111 dependency-cruiser rejects packages importing the browser editor', () => {
    const dir = plant({
      'tsconfig.json': JSON.stringify({ compilerOptions: { allowImportingTsExtensions: true, noEmit: true, module: 'ESNext', moduleResolution: 'Bundler' } }),
      'packages/fit/src/index.ts': "import { label } from '../../../web/src/editor.ts'\nexport const fitLabel = label\n",
      'web/src/editor.ts': "export const label = 'editor'\n"
    })
    copyFileSync(join(ROOT, '.dependency-cruiser.cjs'), join(dir, '.dependency-cruiser.cjs'))
    const { status, output } = run(bin('depcruise'), ['packages', 'web', '--config', '.dependency-cruiser.cjs'], dir)
    expect(status).not.toBe(0)
    expect(output).toContain('packages-stay-pure')
  })
})

describe('AC-112 repo invariants', () => {
  it('AC-112 check:static passes on the repo', () => {
    expect(runStaticChecks(repoFiles)).toEqual([])
  })

  const adr = (number: string) => `# ADR-${number}: Title\n\nDate: 2026-10-19\n\n## Status\n\nAccepted\n`
  it.for([
    ['json', { 'workflows/broken.json': '{ "a": ' }, 'workflows/broken.json'],
    ['secrets', { '.env.local': 'X=1' }, '.env.local'],
    ['secrets', { 'docs/notes.md': `key: ${fakeKey()}` }, 'docs/notes.md'],
    ['action-pins', { '.github/workflows/ci.yaml': 'jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v7\n' }, '.github/workflows/ci.yaml'],
    ['spec-ids', { 'spec/M1-a.md': '## 8. Acceptance criteria\n| AC-1 | active | a |\n', 'spec/M2-b.md': '## Acceptance criteria\n| AC-1 | active | b |\n' }, 'AC-1'],
    ['spec-ids', { 'spec/M1-a.md': '## Acceptance criteria\n| AC-2 | done | a |\n' }, 'AC-2'],
    ['adrs', { 'docs/adr/0001-a.md': adr('0001'), 'docs/adr/0001-b.md': adr('0001') }, '0001'],
    ['adrs', { 'docs/adr/0002-a.md': '# ADR-0003: Wrong number\n' }, 'docs/adr/0002-a.md'],
    ['adrs', { 'docs/adr/Notes.md': adr('0004') }, 'docs/adr/Notes.md'],
    ['suppressions', { 'web/src/a.ts': `// ${'oxlint'}-disable-next-line\nexport const a = 1\n` }, 'web/src/a.ts'],
    ['suppressions', { 'mcp/b.ts': `// @ts-${'ignore'}\nexport const b = 1\n` }, 'mcp/b.ts']
  ] as const)('AC-112 %s reports a planted violation', ([check, files, mentions]) => {
    const problems = CHECKS[check](memoryFiles(files))
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.every((problem) => problem.check === check)).toBe(true)
    expect(JSON.stringify(problems)).toContain(mentions)
  })

  it('AC-112 secrets never prints the value it found', () => {
    const key = fakeKey()
    const problems = CHECKS.secrets(memoryFiles({ 'web/src/config.ts': `export const key = '${key}'` }))
    expect(problems).toHaveLength(1)
    expect(JSON.stringify(problems)).not.toContain(key)
  })

  it('AC-112 well-formed inputs pass every check', () => {
    const files = memoryFiles({
      'workflows/ok.json': '{}',
      '.github/workflows/ci.yaml': `steps:\n  - uses: actions/checkout@${'a'.repeat(40)} # v7\n  - uses: ./local-action\n`,
      'spec/M1-a.md': '## Acceptance criteria\n| AC-1 | active | a |\n## 9. Test plan\n| AC-1 | vitest |\n',
      'docs/adr/0001-a.md': adr('0001')
    })
    expect(runStaticChecks(files)).toEqual([])
  })
})

describe('AC-113 the CI workflow', () => {
  const workflow = parse(readFileSync('.github/workflows/ci.yaml', 'utf8'))
  const scripts = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts)
  const steps: { run?: string }[] = Object.values(workflow.jobs as Record<string, { steps: { run?: string }[] }>).flatMap((job) => job.steps)

  it('AC-113 runs static, unit, e2e, e2e-gpu and python jobs on pushes and pull requests with read-only permissions', () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual(['e2e', 'e2e-gpu', 'python', 'static', 'unit'])
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.on).toHaveProperty('push')
    expect(workflow.on).toHaveProperty('pull_request')
  })

  it('AC-113 pins every action to a commit SHA', () => {
    expect(CHECKS['action-pins'](repoFiles).filter((problem) => problem.file === '.github/workflows/ci.yaml')).toEqual([])
  })

  it('AC-113 every pnpm script it runs exists', () => {
    const used = steps.flatMap((step) => [...(step.run ?? '').matchAll(/\bpnpm (?!install\b|exec\b|-)([\w:]+)/g)].map((match) => match[1]))
    expect(used.length).toBeGreaterThan(5)
    expect(used.filter((script) => !scripts.includes(script as string))).toEqual([])
  })

  it('AC-113 the static job runs every static gate', () => {
    const runs = steps.map((step) => step.run ?? '')
    for (const script of ['pnpm lint', 'pnpm knip', 'pnpm deps:check', 'pnpm check:static', 'pnpm typecheck', 'pnpm schema:export --check', 'pnpm test:coverage', 'pnpm e2e', 'pnpm lint:python']) {
      expect(runs, script).toContain(script)
    }
  })
})

describe('AC-114 verify runs the static gates', () => {
  it('AC-114 verify has lint, knip, deps and static check gates', () => {
    const verify = readFileSync('harness/verify.mjs', 'utf8')
    for (const gate of ["run('lint', 'pnpm', ['-s', 'lint'])", "run('knip', 'pnpm', ['-s', 'knip'])", "run('deps', 'pnpm', ['-s', 'deps:check'])", "run('static checks', 'pnpm', ['-s', 'check:static'])"]) {
      expect(verify).toContain(gate)
    }
  })
})
