import { spawn } from 'node:child_process'
import { once } from 'node:events'

import { describe, expect, it } from 'vitest'

import { holdVerifyLock } from '../tools/verify-lock.mjs'

const TEST_PORT = 8193

async function holderProcess() {
  const holder = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    `const { holdVerifyLock } = await import('${new URL('../tools/verify-lock.mjs', import.meta.url).href}'); await holdVerifyLock({ port: ${TEST_PORT} }); console.log('held'); setInterval(() => {}, 1000)`
  ])
  await once(holder.stdout, 'data')
  return holder
}

describe('verify lock', () => {
  it('makes a second verify wait for the first, and frees the lock when the first is killed', async () => {
    const holder = await holderProcess()
    const waits: number[] = []
    const second = holdVerifyLock({ port: TEST_PORT, retryMs: 50, onWait: (port) => waits.push(port) })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(waits).toEqual([TEST_PORT])

    holder.kill('SIGKILL')
    const server = await second
    expect(server.listening).toBe(true)
    server.close()
  })
})
