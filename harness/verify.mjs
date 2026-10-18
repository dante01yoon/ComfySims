import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const STATE_DIR = '.harness'
const VITEST_REPORT = join(STATE_DIR, 'vitest.json')

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

function testsByCriterion(report) {
  const tests = report.testResults.flatMap((file) => file.assertionResults)
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

const gates = [
  run('contract drift', 'pnpm', ['exec', 'tsx', 'packages/schema/scripts/export-json-schema.ts', '--check']),
  run('typecheck', 'pnpm', ['exec', 'tsc', '--noEmit']),
  run('tests', 'pnpm', ['exec', 'vitest', 'run', '--reporter=json', `--outputFile=${VITEST_REPORT}`])
]

const report = JSON.parse(readFileSync(VITEST_REPORT, 'utf8'))
const countsFor = testsByCriterion(report)
const criteria = readAcceptanceCriteria().map((criterion) => {
  const counts = countsFor(criterion.id)
  return { ...criterion, ...counts, ...judge(criterion, counts) }
})

const failedTests = report.testResults
  .flatMap((file) => file.assertionResults.map((test) => ({ ...test, file: file.name })))
  .filter((test) => test.status === 'failed')

console.log('Gates')
for (const gate of gates) console.log(`  ${gate.ok ? 'PASS' : 'FAIL'}  ${gate.label} (${gate.ms} ms)`)
console.log('\nSpec')
for (const c of criteria) {
  const tally = c.passed + c.failed + c.todo > 0 ? `  [${c.passed} pass, ${c.failed} fail, ${c.todo} todo]` : ''
  console.log(`  ${c.mark.padEnd(7)} ${c.id.padEnd(6)} ${c.status.padEnd(8)} ${c.criterion}${tally}`)
}

const problems = [
  ...gates.filter((gate) => !gate.ok && gate.label !== 'tests').map((gate) => `${gate.label}:\n${gate.output.slice(-2000)}`),
  ...failedTests.map((test) => `${test.fullName}\n  ${test.file}\n  ${(test.failureMessages ?? []).join('\n').split('\n').slice(0, 6).join('\n  ')}`),
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
