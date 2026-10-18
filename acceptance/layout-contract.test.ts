import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { parseLayout, serializeLayout } from '../packages/schema/src/index.ts'

const fixture = JSON.parse(readFileSync('fixtures/layouts/living-room.json', 'utf8'))

function withChange(change: (layout: typeof fixture) => void) {
  const copy = structuredClone(fixture)
  change(copy)
  return copy
}

describe('AC-1 layout contract', () => {
  it('AC-1 round-trips the fixture layout unchanged', () => {
    const parsed = parseLayout(fixture)
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))

    const reparsed = parseLayout(JSON.parse(serializeLayout(parsed.layout)))

    expect(reparsed).toEqual({ ok: true, layout: fixture })
  })

  it.for([
    {
      name: 'an item pointing at a missing asset',
      layout: withChange((l) => { l.items[0].assetId = 'asset-missing' }),
      path: 'items.0.assetId'
    },
    {
      name: 'a zero-width asset',
      layout: withChange((l) => { l.assets[0].dimensions.width = 0 }),
      path: 'assets.0.dimensions.width'
    },
    {
      name: 'rotation of a full turn',
      layout: withChange((l) => { l.items[0].rotationY = 360 }),
      path: 'items.0.rotationY'
    },
    {
      name: 'duplicate item ids',
      layout: withChange((l) => { l.items.push(structuredClone(l.items[0])) }),
      path: 'items'
    },
    {
      name: 'an unknown field',
      layout: withChange((l) => { l.items[0].scale = 2 }),
      path: 'items.0'
    },
    {
      name: 'a future version',
      layout: withChange((l) => { l.version = 2 }),
      path: 'version'
    }
  ])('AC-1 rejects $name at $path', ({ layout, path }) => {
    const parsed = parseLayout(layout)

    expect(parsed.ok).toBe(false)
    expect(parsed.ok ? [] : parsed.issues.map((issue) => issue.path)).toContain(path)
  })
})
