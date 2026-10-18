import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [name, promptFile] = process.argv.slice(2)
if (!name || !promptFile) {
  console.error('usage: node harness/tools/run-session.mjs <session-name> <prompt-file>')
  process.exit(2)
}

const prompt = readFileSync(promptFile, 'utf8')
mkdirSync('.recordings', { recursive: true })
const raw = join('.recordings', `${name}.jsonl`)
const out = createWriteStream(raw)
const started = new Date()

const child = spawn('claude', [
  '-p', prompt,
  '--output-format', 'stream-json', '--verbose',
  '--permission-mode', 'acceptEdits',
  '--allowedTools', 'Bash(pnpm:*)', 'Bash(node:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(grep:*)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)'
], { stdio: ['ignore', 'pipe', 'inherit'] })

child.stdout.pipe(out)
child.on('close', (code) => {
  const events = readFileSync(raw, 'utf8').split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line) } catch { return null }
  }).filter(Boolean)
  const text = readFileSync(raw, 'utf8')
  const result = events.findLast((event) => event.type === 'result') ?? {}
  const toolUses = events.flatMap((event) => event.message?.content ?? []).filter((part) => part.type === 'tool_use')
  const byTool = Object.entries(toolUses.reduce((acc, use) => ({ ...acc, [use.name]: (acc[use.name] ?? 0) + 1 }), {}))
  const summary = {
    name,
    startedAt: started.toISOString(),
    exitCode: code,
    durationSec: Math.round((result.duration_ms ?? Date.now() - started) / 1000),
    turns: result.num_turns,
    costUsd: result.total_cost_usd,
    toolCalls: Object.fromEntries(byTool),
    stopHookSentBack: (text.match(/pnpm verify failed \(attempt/g) ?? []).length,
    guardBlocks: (text.match(/Blocked: \\"/g) ?? []).length,
    finalMessage: result.result
  }
  writeFileSync(join('.recordings', `${name}.summary.json`), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
})
