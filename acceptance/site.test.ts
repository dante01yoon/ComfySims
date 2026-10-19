import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { parseLayout } from '../packages/schema/src/index.ts'
import type { PlanRoom, RoomLayout } from '../packages/schema/src/index.ts'
import { defaultSite } from '../packages/placement/src/index.ts'
import { planDiff } from '../harness/tools/plan-diff.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const room = house.room as PlanRoom
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const rectangle = (minX: number, minZ: number, maxX: number, maxZ: number) => [{ x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ }]

describe('AC-83 a house sits on a site and can carry its blueprint', () => {
  it('AC-83 accepts a site and a blueprint', () => {
    const layout = { ...house, site: { lot: rectangle(-1000, -800, 1000, 900), ground: 'grass', trees: [{ x: 900, z: 800 }], path: [{ x: -225, z: 500 }, { x: -225, z: 900 }] }, blueprint: { image: PIXEL, cmPerPixel: 1.11, origin: { x: -878, y: 0, z: -678 } } }
    expect(parseLayout(layout).ok).toBe(false)
    const fixed = { ...layout, blueprint: { image: PIXEL, cmPerPixel: 1.11, origin: { x: -878, z: -678 } } }
    expect(parseLayout(fixed).ok).toBe(true)
  })

  it.for([
    { name: 'a lot that cuts through the house', site: { lot: rectangle(-600, -800, 1000, 900), ground: 'grass' } },
    { name: 'an unknown ground', site: { lot: rectangle(-1000, -800, 1000, 900), ground: 'lava' } },
    { name: 'a blueprint scale of zero', blueprint: { image: PIXEL, cmPerPixel: 0, origin: { x: 0, z: 0 } } },
    { name: 'a blueprint that is not an image', blueprint: { image: 'https://example.com/plan.png', cmPerPixel: 1, origin: { x: 0, z: 0 } } }
  ])('AC-83 rejects $name', (change) => {
    const { name: _, ...fields } = change
    expect(parseLayout({ ...house, ...fields }).ok).toBe(false)
  })

  it('AC-83 the default site is the house bounds plus 5 m of grass, with a path from the front door to the lot edge', () => {
    const site = defaultSite(room)
    const xs = site.lot.map((p) => p.x)
    const zs = site.lot.map((p) => p.z)
    expect([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]).toEqual([-1200, -1000, 1200, 1000])
    expect(site.ground).toBe('grass')
    expect(site.path?.[0]).toEqual({ x: -225, z: 500 })
    expect(site.path?.at(-1)?.z).toBe(1000)
    expect(defaultSite(room)).toEqual(site)
    for (const tree of site.trees ?? []) {
      expect(tree.x >= -1200 && tree.x <= 1200 && tree.z >= -1000 && tree.z <= 1000, 'tree inside the lot').toBe(true)
      expect(tree.x < -800 || tree.x > 800 || tree.z < -600 || tree.z > 600, 'tree at least 1 m from the house').toBe(true)
    }
    expect(parseLayout({ ...house, site }).ok).toBe(true)
  })
})

describe('AC-88 plan-diff measures an extracted plan against a reference', () => {
  const shifted = (change: (plan: PlanRoom) => void) => {
    const copy = structuredClone(room)
    change(copy)
    return copy
  }

  it('AC-88 reports zero for identical plans', () => {
    const diff = planDiff(room, room)
    expect(diff.walls.maxEndpointErrorCm).toBe(0)
    expect(diff.openings).toMatchObject({ kindMismatches: 0, maxCentreErrorCm: 0, maxWidthErrorCm: 0 })
    expect(diff.zones).toMatchObject({ missing: [], maxBoundsErrorCm: 0 })
  })

  it('AC-88 reports a wall moved by 30 cm, an opening moved by 20 cm, a window read as a door and a missing room', () => {
    const candidate = shifted((plan) => {
      const wall = plan.walls.find((entry) => entry.id === 'bed-office')!
      wall.from.x += 30
      wall.to.x += 30
      plan.openings.find((entry) => entry.wallId === 'ext-north' && entry.kind === 'window')!.offset += 20
      plan.openings.find((entry) => entry.wallId === 'ext-east')!.kind = 'door'
      plan.zones = plan.zones.filter((zone) => zone.id !== 'bath')
    })
    const diff = planDiff(room, candidate)
    expect(diff.walls.maxEndpointErrorCm).toBe(30)
    expect(diff.openings.maxCentreErrorCm).toBeGreaterThanOrEqual(20)
    expect(diff.openings.kindMismatches).toBe(1)
    expect(diff.zones.missing).toEqual(['Bath'])
  })

  it('AC-88 the M9 spike extraction scores zero against the demo house', () => {
    const extracted = JSON.parse(readFileSync('docs/spikes/m9/extracted-room.json', 'utf8'))
    const diff = planDiff(room, extracted)
    expect([diff.walls.maxEndpointErrorCm, diff.openings.maxCentreErrorCm, diff.zones.maxBoundsErrorCm, diff.openings.kindMismatches]).toEqual([0, 0, 0, 0])
  })
})
