import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TLA_TOOLS = {
  version: '1.8.0',
  url: 'https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar',
  sha256: '5bd7b64db99ae4c6c35f290de5e809c0ee41af43f8699cf696099ffb6452b1e2'
}

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const jar = join(repo, '.harness', 'tools', `tla2tools-${TLA_TOOLS.version}.jar`)
const model = readFileSync(join(here, 'JobQueue.tla'), 'utf8')

const CHECKS = [
  { cfg: 'slots', rule: 'At most MAX_CONCURRENT_JOBS jobs hold a slot, and runningJobs counts them', expect: 'pass' },
  { cfg: 'guarded-retries', rule: 'A pano360 / walkthrough job and its retries never run at once', expect: 'pass' },
  {
    cfg: 'card-retries',
    rule: 'A render / product / photo3d job and its retries never run at once',
    expect: 'NoJobRunsTwice',
    finding: 'F1: pressing Retry twice on one failed card starts the same request twice, both holding slots'
  }
]

const MUTANTS = [
  {
    name: 'takeSlot admits one job too many (< becomes <=)',
    cfg: 'slots',
    from: 'IF runningJobs < MaxConcurrentJobs',
    to: 'IF runningJobs <= MaxConcurrentJobs',
    killedBy: ['SlotsWithinLimit', 'TypeOK']
  },
  {
    name: 'releaseSlot decrements even when it hands the slot to a waiter',
    cfg: 'slots',
    from: "/\\ waitingForSlot' = Tail(waitingForSlot)\n              /\\ UNCHANGED runningJobs",
    to: "/\\ waitingForSlot' = Tail(waitingForSlot)\n              /\\ runningJobs' = runningJobs - 1",
    killedBy: ['SlotCountMatches', 'SlotsWithinLimit', 'TypeOK']
  },
  {
    name: 'releaseSlot wakes the waiter without giving it the slot',
    cfg: 'slots',
    from: "![next].phase = \"granted\"]",
    to: "![next].phase = \"queued\"]",
    killedBy: ['SlotCountMatches']
  },
  {
    name: 'panoramaOf / walkthroughOf lose the "already being made" guard',
    cfg: 'guarded-retries',
    from: 'EntryRejects(r) == r \\in GuardedRequests /\\ Unfinished(r)',
    to: 'EntryRejects(r) == FALSE',
    killedBy: ['NoJobRunsTwice']
  }
]

function ensureJar() {
  if (!existsSync(jar)) {
    mkdirSync(dirname(jar), { recursive: true })
    const download = spawnSync('curl', ['-fsSL', '-o', jar, TLA_TOOLS.url], { stdio: 'inherit' })
    if (download.status !== 0) fail(`could not download ${TLA_TOOLS.url}`)
  }
  const digest = createHash('sha256').update(readFileSync(jar)).digest('hex')
  if (digest !== TLA_TOOLS.sha256) {
    rmSync(jar)
    fail(`${jar} has sha256 ${digest}, expected ${TLA_TOOLS.sha256}; removed it, run again`)
  }
}

function fail(message) {
  console.error(`FORMAL ERROR ${message}`)
  process.exit(2)
}

function tlc(source, cfg) {
  const dir = mkdtempSync(join(tmpdir(), 'job-queue-'))
  try {
    writeFileSync(join(dir, 'JobQueue.tla'), source)
    writeFileSync(join(dir, `${cfg}.cfg`), readFileSync(join(here, `${cfg}.cfg`), 'utf8'))
    const run = spawnSync(
      'java',
      ['-XX:+UseParallelGC', '-cp', jar, 'tlc2.TLC', '-deadlock', '-workers', 'auto', '-noGenerateSpecTE', '-metadir', join(dir, 'states'), '-config', `${cfg}.cfg`, 'JobQueue.tla'],
      { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
    const output = `${run.stdout}${run.stderr}`
    const violated = output.match(/Invariant (\w+) is violated/)?.[1]
    if (violated) return { outcome: violated, trace: traceOf(output) }
    if (run.status === 0 && output.includes('Model checking completed. No error has been found.')) return { outcome: 'pass', states: output.match(/([\d,]+) distinct states found, 0 states left/)?.[1] }
    return { outcome: 'error', output }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function traceOf(output) {
  const start = output.indexOf('State 1:')
  const end = output.search(/\n[\d,]+ states generated/)
  return output.slice(start, end === -1 ? undefined : end).trim()
}

ensureJar()
const withMutants = !process.argv.includes('--no-mutants')
let ok = true

for (const check of CHECKS) {
  const result = tlc(model, check.cfg)
  if (result.outcome === 'error') {
    console.log(`ERROR  ${check.cfg}: TLC did not finish\n${result.output}`)
    ok = false
    continue
  }
  const matches = result.outcome === check.expect
  ok &&= matches
  const label = result.outcome === 'pass' ? `PASS   ${check.cfg} (${result.states} states)` : `FAIL   ${check.cfg}: ${result.outcome} violated`
  console.log(`${matches ? '' : 'UNEXPECTED '}${label} — ${check.rule}`)
  if (check.finding) console.log(`       known finding ${check.finding}${matches ? ' (still reproduces)' : ' (NO LONGER REPRODUCES: update the expectation in check.mjs and the skill)'}`)
  if (result.trace && (!matches || process.argv.includes('--traces'))) console.log(`\n${result.trace}\n`)
}

if (withMutants) {
  for (const mutant of MUTANTS) {
    if (!model.includes(mutant.from)) {
      console.log(`STALE  mutant "${mutant.name}": its text is no longer in JobQueue.tla`)
      ok = false
      continue
    }
    const result = tlc(model.replace(mutant.from, mutant.to), mutant.cfg)
    const killed = mutant.killedBy.includes(result.outcome)
    ok &&= killed
    console.log(`${killed ? 'KILLED ' : 'SURVIVED'} mutant "${mutant.name}" → ${result.outcome}`)
  }
}

console.log(ok ? 'FORMAL JOB-QUEUE OK' : 'FORMAL JOB-QUEUE MISMATCH')
process.exit(ok ? 0 : 1)
