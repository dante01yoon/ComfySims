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
    { name: 'deleting fixtures from the shell', call: bash('rm -rf fixtures/glb') },
    { name: 'rewriting a test with sed', call: bash("sed -i '' 's/200/100/' acceptance/glb-fitting.test.ts") }
  ])('blocks $name', ({ call }) => {
    expect(decide(call, false)).toMatch(/protected/)
  })

  it.for([
    { name: 'editing package source', call: edit('packages/schema/src/layout.ts') },
    { name: 'reading a spec from the shell', call: bash('cat spec/M1-scaled-furniture.md') },
    { name: 'running verify', call: bash('pnpm verify') }
  ])('allows $name', ({ call }) => {
    expect(decide(call, false)).toBeNull()
  })

  it('allows protected edits in a spec session', () => {
    expect(decide(edit('spec/M1-scaled-furniture.md'), true)).toBeNull()
  })
})
