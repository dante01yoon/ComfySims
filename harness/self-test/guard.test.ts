import { describe, expect, it } from 'vitest'

import { decide } from '../hooks/guard.mjs'

const edit = (file_path: string) => ({ tool_name: 'Edit', tool_input: { file_path } })
const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } })

describe('harness guard', () => {
  it.for([
    { name: 'editing a spec', call: edit('spec/M1-scaled-furniture.md') },
    { name: 'editing an acceptance test by absolute path', call: edit(`${process.cwd()}/acceptance/layout-contract.test.ts`) },
    { name: 'editing the harness itself', call: edit('harness/verify.mjs') },
    { name: 'editing hook settings', call: edit('.claude/settings.json') },
    { name: 'editing the layout contract package', call: edit('packages/schema/src/domain.ts') },
    { name: 'deleting fixtures from the shell', call: bash('rm -rf fixtures/glb') },
    { name: 'rewriting a test with sed', call: bash("sed -i '' 's/200/100/' acceptance/glb-fitting.test.ts") },
    { name: 'overwriting a spec behind a silenced error', call: bash('echo x > spec/M4-agent-mcp.md 2>/dev/null') }
  ])('blocks $name', ({ call }) => {
    expect(decide(call, false)).toMatch(/protected/)
  })

  it.for([
    { name: 'editing package source', call: edit('packages/fit/src/index.ts') },
    { name: 'reading a spec from the shell', call: bash('cat spec/M1-scaled-furniture.md') },
    { name: 'running verify', call: bash('pnpm verify') },
    { name: 'reading a spec with errors silenced', call: bash('ls spec 2>/dev/null; sed -n 1,80p spec/M4-agent-mcp.md 2>/dev/null') },
    { name: 'reading a spec with stderr merged', call: bash('cat spec/M4-agent-mcp.md 2>&1') }
  ])('allows $name', ({ call }) => {
    expect(decide(call, false)).toBeNull()
  })

  it('allows protected edits in a spec session', () => {
    expect(decide(edit('spec/M1-scaled-furniture.md'), true)).toBeNull()
  })
})
