import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_RETRIES = 3
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const retriesFile = join(root, '.harness', 'stop-retries.json')

const input = JSON.parse(readFileSync(0, 'utf8'))
const retries = existsSync(retriesFile) ? JSON.parse(readFileSync(retriesFile, 'utf8')) : {}
const saveRetries = (value) => {
  mkdirSync(join(root, '.harness'), { recursive: true })
  writeFileSync(retriesFile, JSON.stringify(value))
}

const changed = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim()
if (!changed) process.exit(0)

if (/^\s*BLOCKED:/m.test(input.last_assistant_message ?? '')) process.exit(0)

const verify = spawnSync('pnpm', ['-s', 'verify'], { cwd: root, encoding: 'utf8' })
if (verify.status === 0) {
  delete retries[input.session_id]
  saveRetries(retries)
  process.exit(0)
}

const attempt = (retries[input.session_id] ?? 0) + 1
saveRetries({ ...retries, [input.session_id]: attempt })

if (attempt > MAX_RETRIES) {
  console.log(JSON.stringify({
    systemMessage: `roomfit harness: verify still failing after ${MAX_RETRIES} retries. Stopping; a human should look at .harness/last-verify.json.`
  }))
  process.exit(0)
}

console.log(JSON.stringify({
  decision: 'block',
  reason:
    `pnpm verify failed (attempt ${attempt}/${MAX_RETRIES}). Fix the cause and finish again. ` +
    'Do not edit specs, acceptance tests, fixtures or the harness; if they are wrong, reply starting with "BLOCKED:".\n\n' +
    verify.stdout.split('\n').slice(-40).join('\n')
}))
