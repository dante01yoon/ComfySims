import { describe, expect, it } from 'vitest'

import type { ContractChecks } from './contract-types.ts'

describe('AC-38 one definition per domain type', () => {
  it('AC-38 implementations and the editor contract use the contract package types (checked by typecheck)', () => {
    const checks: ContractChecks['length'] = 8
    expect(checks).toBe(8)
  })
})
