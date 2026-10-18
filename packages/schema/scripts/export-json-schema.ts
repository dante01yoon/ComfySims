import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

import { RoomLayout } from '../src/layout.ts'

const target = fileURLToPath(new URL('../../../spec/contracts/room-layout.schema.json', import.meta.url))
const generated = `${JSON.stringify(z.toJSONSchema(RoomLayout, { target: 'draft-2020-12' }), null, 2)}\n`

if (process.argv.includes('--check')) {
  const committed = readFileSync(target, 'utf8')
  if (committed !== generated) {
    console.error('spec/contracts/room-layout.schema.json is stale. Run: pnpm schema:export')
    process.exit(1)
  }
  console.log('contract up to date')
} else {
  writeFileSync(target, generated)
  console.log(`wrote ${target}`)
}
