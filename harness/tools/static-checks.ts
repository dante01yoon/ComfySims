import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

export type Problem = { check: string; file: string; message: string }
export type Files = { list: () => string[]; read: (path: string) => string }

const COMFY_KEY = /comfyui-[A-Za-z0-9_-]{20,}/
const PINNED = /^[^@\s]+@[0-9a-f]{40}$/
const AC_ROW = /^\|\s*(AC-\d+)\s*\|\s*([^|]+?)\s*\|/
const AC_STATUSES = new Set(['active', 'planned', 'manual'])
const ADR_FILE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const SUPPRESSION = new RegExp(['(ox|es)lint-disable', '@ts-(ignore|nocheck)'].join('|'))
const SOURCE_FILE = /\.(ts|tsx|mjs|cjs|js)$/
const TEXT_FILE = /\.(md|json|ya?ml|ts|tsx|mjs|cjs|js|py|html|txt|css|sh|toml)$|(^|\/)\.[a-z]+rc$/

function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return [...groups]
}

export const repoFiles: Files = {
  list: () => execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean),
  read: (path) => readFileSync(path, 'utf8')
}

export function checkJson(files: Files): Problem[] {
  return files.list().filter((file) => file.endsWith('.json')).flatMap((file) => {
    try {
      JSON.parse(files.read(file))
      return []
    } catch (error) {
      return [{ check: 'json', file, message: `does not parse: ${(error as Error).message}` }]
    }
  })
}

export function checkSecrets(files: Files): Problem[] {
  return files.list().flatMap((file) => {
    if (/(^|\/)\.env(\.|$)/.test(file) && !file.endsWith('.example')) return [{ check: 'secrets', file, message: 'environment files must not be committed' }]
    if (!TEXT_FILE.test(file)) return []
    return files.read(file).split('\n').flatMap((line, index) =>
      COMFY_KEY.test(line) ? [{ check: 'secrets', file, message: `line ${index + 1} looks like a Comfy API key` }] : []
    )
  })
}

export function checkActionPins(files: Files): Problem[] {
  return files.list().filter((file) => /^\.github\/(workflows|actions)\/.+\.ya?ml$/.test(file)).flatMap((file) =>
    files.read(file).split('\n').flatMap((line, index) => {
      const uses = line.match(/^\s*(?:-\s*)?uses:\s*['"]?([^'"\s#]+)/)?.[1]
      if (!uses || uses.startsWith('./') || PINNED.test(uses)) return []
      return [{ check: 'action-pins', file, message: `line ${index + 1}: "${uses}" is not pinned to a commit SHA` }]
    })
  )
}

function acceptanceSection(spec: string): string[] {
  const lines = spec.split('\n')
  const start = lines.findIndex((line) => /^## .*Acceptance criteria/.test(line))
  if (start < 0) return []
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return lines.slice(start + 1, end < 0 ? undefined : end)
}

export function checkSpecIds(files: Files): Problem[] {
  const specs = files.list().filter((file) => /^spec\/M\d+-.+\.md$/.test(file))
  const rows = specs.flatMap((file) =>
    acceptanceSection(files.read(file)).flatMap((line) => {
      const match = line.match(AC_ROW)
      return match ? [{ file, id: match[1] as string, status: match[2] as string }] : []
    })
  )
  const badStatus = rows.filter((row) => !AC_STATUSES.has(row.status)).map((row) => ({ check: 'spec-ids', file: row.file, message: `${row.id} has status "${row.status}" (expected active, planned or manual)` }))
  const duplicates = groupBy(rows, (row) => row.id).filter(([, found]) => found.length > 1).map(([id, found]) => ({ check: 'spec-ids', file: found[0]!.file, message: `${id} is defined in ${found.map((row) => row.file).join(', ')}` }))
  return [...badStatus, ...duplicates]
}

export function checkAdrs(files: Files): Problem[] {
  const adrs = files.list().filter((file) => file.startsWith('docs/adr/') && file.endsWith('.md'))
  const numbered = adrs.map((file) => ({ file, number: basename(file).match(ADR_FILE)?.[1] }))
  const misnamed = numbered.filter(({ number }) => !number).map(({ file }) => ({ check: 'adrs', file, message: 'name must be NNNN-lowercase-slug.md' }))
  const duplicates = groupBy(numbered.filter(({ number }) => number), ({ number }) => number ?? '').filter(([, found]) => found.length > 1).map(([number, found]) => ({ check: 'adrs', file: found[0]!.file, message: `ADR number ${number} is used by ${found.map(({ file }) => file).join(', ')}` }))
  const malformed = numbered.flatMap(({ file, number }) => {
    if (!number) return []
    const lines = files.read(file).split('\n')
    return [
      ...(lines[0]?.startsWith(`# ADR-${number}: `) ? [] : [`first line must start with "# ADR-${number}: "`]),
      ...(lines.some((line) => /^Date: \d{4}-\d{2}-\d{2}$/.test(line)) ? [] : ['needs a "Date: YYYY-MM-DD" line']),
      ...(lines.includes('## Status') ? [] : ['needs a "## Status" section'])
    ].map((message) => ({ check: 'adrs', file, message }))
  })
  return [...misnamed, ...duplicates, ...malformed]
}

export function checkSuppressions(files: Files): Problem[] {
  return files.list().filter((file) => SOURCE_FILE.test(file) && !file.startsWith('demo/out/')).flatMap((file) =>
    files.read(file).split('\n').flatMap((line, index) =>
      SUPPRESSION.test(line) ? [{ check: 'suppressions', file, message: `line ${index + 1} silences a lint or type check; fix the code instead` }] : []
    )
  )
}

export const CHECKS = { json: checkJson, secrets: checkSecrets, 'action-pins': checkActionPins, 'spec-ids': checkSpecIds, adrs: checkAdrs, suppressions: checkSuppressions }

export function runStaticChecks(files: Files = repoFiles): Problem[] {
  return Object.values(CHECKS).flatMap((check) => check(files))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = runStaticChecks()
  for (const { check, file, message } of problems) console.log(`${check}  ${file}: ${message}`)
  console.log(problems.length === 0 ? `static checks pass (${Object.keys(CHECKS).join(', ')})` : `${problems.length} problem(s)`)
  process.exit(problems.length === 0 ? 0 : 1)
}
