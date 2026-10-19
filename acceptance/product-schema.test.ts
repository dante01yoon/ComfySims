import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { parseLayout } from '../packages/schema/src/index.ts'

const fixture = JSON.parse(readFileSync('fixtures/layouts/living-room.json', 'utf8'))
const THUMBNAIL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='
const withAsset = (change: Record<string, unknown>) => {
  const copy = structuredClone(fixture)
  Object.assign(copy.assets[0], change)
  return copy
}
const product = { photo: { thumbnail: THUMBNAIL, comfyInputName: 'upload-1.png' }, url: 'https://store.example/p/grey-sofa-200/', brand: 'IKEA', store: 'IKEA Korea' }

describe('AC-77 assets carry their product and labels', () => {
  it('AC-77 accepts product fields and labels and keeps them', () => {
    const layout = withAsset({ product, labels: ['living', 'shortlist'] })
    const parsed = parseLayout(layout)
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
    expect(parsed.layout.assets[0]).toMatchObject({ product, labels: ['living', 'shortlist'] })
  })

  it.for([
    { name: 'a javascript: link', change: { product: { url: 'javascript:alert(1)' } } },
    { name: 'an ftp link', change: { product: { url: 'ftp://example.com/sofa' } } },
    { name: 'a thumbnail that is not an image data URL', change: { product: { photo: { thumbnail: 'https://example.com/sofa.jpg' } } } },
    { name: 'a thumbnail over 40 KB', change: { product: { photo: { thumbnail: `data:image/jpeg;base64,${'A'.repeat(60_000)}` } } } },
    { name: 'a 33-character label', change: { labels: ['x'.repeat(33)] } },
    { name: 'an empty label', change: { labels: ['  '] } },
    { name: 'thirteen labels', change: { labels: Array.from({ length: 13 }, (_, i) => `label-${i}`) } },
    { name: 'the same label twice in different case', change: { labels: ['Living', 'living'] } }
  ])('AC-77 rejects $name', ({ change }) => {
    expect(parseLayout(withAsset(change)).ok).toBe(false)
  })

  it.for(['fixtures/layouts/living-room.json', 'fixtures/layouts/demo-house.json'])('AC-77 loads %s', (path) => {
    expect(parseLayout(JSON.parse(readFileSync(path, 'utf8'))).ok).toBe(true)
  })

  it('AC-77 a layout written before M7 (no product, no labels) still loads', () => {
    const old = structuredClone(fixture)
    for (const asset of old.assets) { delete asset.product; delete asset.labels }
    expect(parseLayout(old).ok).toBe(true)
  })
})
