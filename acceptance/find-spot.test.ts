import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { collisions, findSpot, outOfBounds } from '../packages/placement/src/index.ts'
import type { RoomLayout } from '../packages/schema/src/index.ts'

const sofa = { width: 200, depth: 90, height: 85 }
const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))

function oneRoom(obstacles: { x: number; z: number; width: number; depth: number }[] = []): RoomLayout {
  return {
    version: 1, id: 'one', name: 'one', units: 'cm',
    room: {
      kind: 'plan', wallHeight: 250, wallThickness: 15,
      walls: [
        { id: 's', from: { x: -200, z: 150 }, to: { x: 200, z: 150 } },
        { id: 'e', from: { x: 200, z: 150 }, to: { x: 200, z: -150 } },
        { id: 'n', from: { x: 200, z: -150 }, to: { x: -200, z: -150 } },
        { id: 'w', from: { x: -200, z: -150 }, to: { x: -200, z: 150 } }
      ],
      openings: [{ wallId: 'w', kind: 'door', offset: 100, width: 100, height: 210, sill: 0 }],
      zones: [{ id: 'room', name: 'Room', floor: 'oak', polygon: [{ x: -200, z: -150 }, { x: 200, z: -150 }, { x: 200, z: 150 }, { x: -200, z: 150 }] }]
    },
    assets: obstacles.map((o, i) => ({ id: `o${i}`, name: 'obstacle', uri: 'o.glb', dimensions: { width: o.width, depth: o.depth, height: 80 }, source: { kind: 'upload' as const } })),
    items: obstacles.map((o, i) => ({ id: `item-o${i}`, assetId: `o${i}`, position: { x: o.x, y: 0, z: o.z }, rotationY: 0 }))
  }
}

function withPlaced(layout: RoomLayout, spot: { position: { x: number; y: number; z: number }; rotationY: number }, dimensions = sofa): RoomLayout {
  return {
    ...layout,
    assets: [...layout.assets, { id: 'new', name: 'new', uri: 'n.glb', dimensions, source: { kind: 'upload' } }],
    items: [...layout.items, { id: 'item-new', assetId: 'new', position: spot.position, rotationY: spot.rotationY }]
  }
}

const front = (rotationY: number) => {
  const r = (rotationY * Math.PI) / 180
  return { x: Math.sin(r), z: Math.cos(r) }
}

describe('AC-39 finding a free spot against a wall', () => {
  it('AC-39 puts a sofa against one of the long walls, flush, facing into the room', () => {
    const layout = oneRoom()
    const spot = findSpot(layout, 'room', sofa)
    if (!spot.ok) throw new Error(spot.reason)
    const placed = withPlaced(layout, spot)

    expect(['n', 's']).toContain(spot.wallId)
    expect(outOfBounds(placed)).toEqual([])
    const faceZ = spot.wallId === 'n' ? -142.5 : 142.5
    const backZ = spot.position.z + (spot.wallId === 'n' ? -sofa.depth / 2 : sofa.depth / 2)
    expect(Math.abs(backZ - faceZ)).toBeLessThanOrEqual(0.5)
    const toCenter = { x: -spot.position.x, z: -spot.position.z }
    const facing = front(spot.rotationY)
    expect(facing.x * toCenter.x + facing.z * toCenter.z).toBeGreaterThan(0)
  })

  it('AC-39 avoids furniture already standing at the long walls', () => {
    const layout = oneRoom([{ x: 0, z: -117, width: 300, depth: 50 }, { x: 0, z: 117, width: 300, depth: 50 }])
    const spot = findSpot(layout, 'room', { width: 80, depth: 80, height: 80 })
    if (!spot.ok) throw new Error(spot.reason)
    const placed = withPlaced(layout, spot, { width: 80, depth: 80, height: 80 })

    expect(collisions(placed)).toEqual([])
    expect(outOfBounds(placed)).toEqual([])
  })

  it('AC-39 never blocks a door', () => {
    const layout = oneRoom([{ x: 0, z: -117, width: 300, depth: 50 }, { x: 0, z: 117, width: 300, depth: 50 }, { x: 175, z: 0, width: 30, depth: 280 }])
    const spot = findSpot(layout, 'room', { width: 60, depth: 40, height: 80 })
    if (!spot.ok) throw new Error(spot.reason)
    const zSpan = [spot.position.z - 30, spot.position.z + 30]

    expect(spot.wallId).toBe('w')
    expect(zSpan[1]! <= -50 || zSpan[0]! >= 50).toBe(true)
  })

  it.for([
    { name: 'a piece wider than the room', zone: 'room', dimensions: { width: 500, depth: 90, height: 85 }, reason: 'no-space' },
    { name: 'an unknown zone', zone: 'attic', dimensions: sofa, reason: 'unknown-zone' }
  ])('AC-39 reports $reason for $name', ({ zone, dimensions, reason }) => {
    expect(findSpot(oneRoom(), zone, dimensions)).toEqual({ ok: false, reason })
  })

  it('AC-39 finds a spot for an armchair in every room of the furnished demo house', () => {
    for (const zone of house.room.kind === 'plan' ? house.room.zones : []) {
      const spot = findSpot(house, zone.id, { width: 80, depth: 80, height: 80 })
      if (!spot.ok) throw new Error(`${zone.id}: ${spot.reason}`)
      const placed = withPlaced(house, spot, { width: 80, depth: 80, height: 80 })
      expect(outOfBounds(placed), zone.id).toEqual([])
      expect(collisions(placed), zone.id).toEqual([])
    }
  })
})
