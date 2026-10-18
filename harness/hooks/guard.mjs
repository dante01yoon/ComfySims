import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

export const PROTECTED = ['spec/', 'acceptance/', 'fixtures/', 'harness/', '.claude/', 'vitest.config.ts', 'playwright.config.ts', 'package.json']
const WRITE_HINT = /(>|\btee\b|\brm\b|\bmv\b|\bcp\b|\bsed\s+-i|\bperl\s+-p?i|\bgit\s+(checkout|restore|rm|mv)\b|\btruncate\b|\bwriteFile)/

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

function isProtected(path) {
  const rel = relative(root, isAbsolute(path) ? path : resolve(root, path))
  return !rel.startsWith('..') && PROTECTED.some((entry) => rel === entry.replace(/\/$/, '') || rel.startsWith(entry))
}

export function decide({ tool_name: tool, tool_input: input = {} }, specSession) {
  if (specSession) return null
  const path = input.file_path ?? input.notebook_path
  if (path && isProtected(path)) return `"${relative(root, resolve(root, path))}" is a protected harness file`
  if (tool === 'Bash' && WRITE_HINT.test(input.command ?? '')) {
    const hit = PROTECTED.find((entry) => input.command.includes(entry.replace(/\/$/, '')))
    if (hit) return `this shell command looks like it writes to protected "${hit}"`
  }
  return null
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const reason = decide(JSON.parse(readFileSync(0, 'utf8')), process.env.ROOMFIT_SPEC_SESSION === '1')
  if (reason) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `Blocked: ${reason}. Specs, acceptance tests, fixtures and the harness are owned by the spec session. ` +
          'If the spec or a test is wrong, stop and reply starting with "BLOCKED:" and say what a human should change.'
      }
    }))
  }
}
