import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { scenePrompt, studioPrompt } from '../packages/comfy/src/index.ts'
import type { RoomLayout } from '../packages/schema/src/index.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))

describe('AC-100 the render prompt is built from the layout', () => {
  it('AC-100 a lived-in living room names its floor, its own furniture, the light and living-room details', () => {
    const { positive, negative } = scenePrompt(house, 'living', 'evening', 'lived-in')
    expect(positive.startsWith('Photograph of a lived-in living in the warm evening light:')).toBe(true)
    for (const words of ['three-seat sofa', 'coffee table', 'tv unit', 'armchair', 'oak wood floor', 'warm greige painted walls', 'wool rug', 'linen curtains', 'realistic interior photography']) {
      expect(positive, words).toContain(words)
    }
    for (const elsewhere of ['queen bed', 'wardrobe', 'bathtub', 'car']) expect(positive, elsewhere).not.toContain(elsewhere)
    expect(negative).toBe('empty room, white walls, sterile, showroom, CGI, 3d render, cartoon, blurry, distorted, low quality, text')
  })

  it.for([
    { zone: 'bedroom', floor: 'walnut wood floor', detail: 'linen bedding', furniture: 'queen bed' },
    { zone: 'kitchen', floor: 'ceramic tile floor', detail: 'fruit bowl', furniture: 'dining table' },
    { zone: 'bath', floor: 'ceramic tile floor', detail: 'folded towels', furniture: 'bathtub' },
    { zone: 'office', floor: 'oak wood floor', detail: 'desk lamp', furniture: 'bookshelf' },
    { zone: 'garage', floor: 'polished concrete floor', detail: 'rug, plants, framed prints', furniture: 'car' }
  ])('AC-100 $zone gets its floor, its furniture and its details', ({ zone, floor, detail, furniture }) => {
    const { positive } = scenePrompt(house, zone, 'reading', 'lived-in')
    expect(positive).toContain(floor)
    expect(positive).toContain(detail)
    expect(positive).toContain(furniture)
    expect(positive).toContain('warm reading light')
  })

  it('AC-100 with no room the whole home is described; as built gives the plain prompt', () => {
    expect(scenePrompt(house, null, 'work', 'lived-in').positive.startsWith('Photograph of a lived-in home in the bright daylight:')).toBe(true)
    expect(scenePrompt(house, 'living', 'movie', 'as-built')).toEqual({ positive: studioPrompt('Living', 'movie'), negative: 'blurry, distorted' })
  })

  it('AC-100 furniture is listed once each, at most eight', () => {
    const crowded: RoomLayout = { ...house, items: [...house.items, ...Array.from({ length: 12 }, (_, i) => ({ id: `extra-${i}`, assetId: house.assets[i % house.assets.length]!.id, position: { x: -600 + i * 40, y: 0, z: 250 }, rotationY: 0 }))] }
    const furniture = scenePrompt(crowded, 'living', 'evening', 'lived-in').positive.split(':')[1]!.split(', oak wood floor')[0]!.split(', ').map((name) => name.trim())
    expect(furniture.length).toBeLessThanOrEqual(8)
    expect(new Set(furniture).size).toBe(furniture.length)
  })
})
