import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const STATE_DIR = '.harness'
const VITEST_REPORT = join(STATE_DIR, 'vitest.json')
const E2E_REPORT = join(STATE_DIR, 'e2e.json')
const HAS_EDITOR = existsSync('web/index.html')
const PYTHON_REPORT = join(STATE_DIR, 'python.json')
const COMFYUI_DIR = process.env.ROOMFIT_COMFYUI_DIR ?? join(process.env.HOME ?? '', 'Desktop/github/ComfyUI')
const COMFYUI_PYTHON = join(COMFYUI_DIR, 'venv/bin/python')
const HAS_COMFYUI = existsSync(COMFYUI_PYTHON)

function run(label, command, args) {
  const started = Date.now()
  const result = spawnSync(command, args, { encoding: 'utf8' })
  const ok = result.status === 0
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { label, ok, ms: Date.now() - started, output }
}

function readAcceptanceCriteria() {
  return readdirSync('spec')
    .filter((file) => /^M\d+-.*\.md$/.test(file))
    .flatMap((file) =>
      readFileSync(join('spec', file), 'utf8')
        .split('\n')
        .map((line) => line.match(/^\|\s*(AC-\d+)\s*\|\s*(active|planned|manual)\s*\|\s*(.+?)\s*\|$/))
        .filter(Boolean)
        .map(([, id, status, criterion]) => ({ id, status, criterion, spec: file }))
    )
}

function vitestTests(report) {
  return report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({ fullName: test.fullName, status: test.status, file: file.name, failureMessages: test.failureMessages ?? [] }))
  )
}

function playwrightTests(report) {
  const walk = (suite) => [
    ...(suite.specs ?? []).flatMap((spec) =>
      spec.tests.map((test) => ({
        fullName: spec.title,
        file: spec.file,
        status: { expected: 'passed', flaky: 'passed', unexpected: 'failed', skipped: 'todo' }[test.status] ?? 'failed',
        failureMessages: test.results.flatMap((result) => (result.error?.message ? [result.error.message] : []))
      }))
    ),
    ...(suite.suites ?? []).flatMap(walk)
  ]
  return (report.suites ?? []).flatMap(walk)
}

function testsByCriterion(tests) {
  return (id) => {
    const pattern = new RegExp(`\\b${id}\\b`)
    const matching = tests.filter((test) => pattern.test(test.fullName))
    return {
      passed: matching.filter((test) => test.status === 'passed').length,
      failed: matching.filter((test) => test.status === 'failed').length,
      todo: matching.filter((test) => test.status === 'todo' || test.status === 'pending' || test.status === 'skipped').length
    }
  }
}

function judge(criterion, counts) {
  if (counts.failed > 0) return { mark: 'FAIL', ok: false }
  if (criterion.status === 'manual') return { mark: 'MANUAL', ok: true }
  if (criterion.status === 'planned') return { mark: counts.passed > 0 ? 'EARLY' : 'TODO', ok: true }
  if (counts.passed === 0) return { mark: 'NO TEST', ok: false }
  return { mark: 'PASS', ok: true }
}

mkdirSync(STATE_DIR, { recursive: true })
rmSync(E2E_REPORT, { force: true })
rmSync(PYTHON_REPORT, { force: true })

const gates = [
  run('contract drift', 'pnpm', ['exec', 'tsx', 'packages/schema/scripts/export-json-schema.ts', '--check']),
  run('typecheck', 'pnpm', ['exec', 'tsc', '--noEmit']),
  run('tests', 'pnpm', ['exec', 'vitest', 'run', '--reporter=json', `--outputFile=${VITEST_REPORT}`]),
  ...(HAS_EDITOR ? [run('editor build', 'pnpm', ['-s', 'web:build']), run('e2e', 'pnpm', ['exec', 'playwright', 'test'])] : []),
  ...(HAS_EDITOR && existsSync('nodes/roomfit') ? [run('node pack editor build', 'pnpm', ['-s', 'web:build:nodepack'])] : []),
  ...(HAS_COMFYUI ? [run('python acceptance', COMFYUI_PYTHON, ['harness/tools/run-python-acceptance.py'])] : [])
]

const allTests = [
  ...vitestTests(JSON.parse(readFileSync(VITEST_REPORT, 'utf8'))),
  ...(existsSync(E2E_REPORT) ? playwrightTests(JSON.parse(readFileSync(E2E_REPORT, 'utf8'))) : []),
  ...(existsSync(PYTHON_REPORT) ? JSON.parse(readFileSync(PYTHON_REPORT, 'utf8')).map((test) => ({ ...test, file: 'acceptance/python' })) : [])
]
const countsFor = testsByCriterion(allTests)
const criteria = readAcceptanceCriteria().map((criterion) => {
  const counts = countsFor(criterion.id)
  return { ...criterion, ...counts, ...judge(criterion, counts) }
})

const failedTests = allTests.filter((test) => test.status === 'failed')

console.log('Gates')
if (!HAS_EDITOR) console.log('  SKIP  editor build + e2e (no web/index.html yet)')
if (!HAS_COMFYUI) console.log(`  SKIP  python acceptance (no ComfyUI venv at ${COMFYUI_DIR}; set ROOMFIT_COMFYUI_DIR)`)
for (const gate of gates) console.log(`  ${gate.ok ? 'PASS' : 'FAIL'}  ${gate.label} (${gate.ms} ms)`)
console.log('\nSpec')
for (const c of criteria) {
  const tally = c.passed + c.failed + c.todo > 0 ? `  [${c.passed} pass, ${c.failed} fail, ${c.todo} todo]` : ''
  console.log(`  ${c.mark.padEnd(7)} ${c.id.padEnd(6)} ${c.status.padEnd(8)} ${c.criterion}${tally}`)
}

const problems = [
  ...gates.filter((gate) => !gate.ok && gate.label !== 'tests' && !(gate.label === 'e2e' && existsSync(E2E_REPORT)) && !(gate.label === 'python acceptance' && existsSync(PYTHON_REPORT))).map((gate) => `${gate.label}:\n${gate.output.slice(-2000)}`),
  ...failedTests.map((test) => `${test.fullName}\n  ${test.file}\n  ${test.failureMessages.join('\n').split('\n').slice(0, 6).join('\n  ')}`),
  ...criteria.filter((c) => c.mark === 'NO TEST').map((c) => `${c.id} is active in ${c.spec} but has no passing test named "${c.id} ..."`)
]

const ok = problems.length === 0
writeFileSync(
  join(STATE_DIR, 'last-verify.json'),
  JSON.stringify({ ok, at: new Date().toISOString(), gates: gates.map(({ output, ...gate }) => gate), criteria, problems }, null, 2)
)

if (!ok) {
  console.log('\nProblems')
  for (const problem of problems) console.log(`- ${problem}`)
}
console.log(`\n${ok ? 'VERIFY PASS' : 'VERIFY FAIL'}`)
process.exit(ok ? 0 : 1)
