import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { outOfBounds } from '../packages/placement/src/index.ts'
import { parseLayout, serializeLayout } from '../packages/schema/src/index.ts'
import type { RoomLayout } from '../packages/schema/src/index.ts'

const house = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))

function withChange(change: (layout: typeof house) => void) {
  const copy = structuredClone(house)
  change(copy)
  return copy
}

describe('AC-29 plan rooms in the layout contract', () => {
  it('AC-29 round-trips the demo house', () => {
    const parsed = parseLayout(house)
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues))
    expect(parseLayout(JSON.parse(serializeLayout(parsed.layout)))).toEqual({ ok: true, layout: house })
  })

  it.for([
    { name: 'an opening on an unknown wall', layout: withChange((l) => { l.room.openings[0].wallId = 'nope' }), path: 'room.openings.0.wallId' },
    { name: 'an opening running past its wall', layout: withChange((l) => { l.room.openings[0].offset = 1350 }), path: 'room.openings.0.width' },
    { name: 'a window taller than the wall', layout: withChange((l) => { l.room.openings[2].height = 200 }), path: 'room.openings.2.height' },
    { name: 'duplicate wall ids', layout: withChange((l) => { l.room.walls[1].id = l.room.walls[0].id }), path: 'room.walls' },
    { name: 'a zone with two points', layout: withChange((l) => { l.room.zones[0].polygon = l.room.zones[0].polygon.slice(0, 2) }), path: 'room.zones.0.polygon' }
  ])('AC-29 rejects $name at $path', ({ layout, path }) => {
    const parsed = parseLayout(layout)
    expect(parsed.ok ? [] : parsed.issues.map((issue) => issue.path)).toContain(path)
  })
})

type Piece = { width: number; depth: number; height?: number; x: number; z: number; rotationY?: number }

function planWith(piece: Piece): RoomLayout {
  return {
    version: 1, id: 'plan', name: 'plan', units: 'cm',
    room: {
      kind: 'plan', wallHeight: 250, wallThickness: 15,
      walls: [
        { id: 's', from: { x: -200, z: 150 }, to: { x: 200, z: 150 } },
        { id: 'e', from: { x: 200, z: 150 }, to: { x: 200, z: -150 } },
        { id: 'n', from: { x: 200, z: -150 }, to: { x: -200, z: -150 } },
        { id: 'w', from: { x: -200, z: -150 }, to: { x: -200, z: 150 } },
        { id: 'mid', from: { x: 0, z: -150 }, to: { x: 0, z: 150 } }
      ],
      openings: [{ wallId: 'mid', kind: 'door', offset: 100, width: 100, height: 210, sill: 0 }],
      zones: [
        { id: 'left', name: 'Left', floor: 'oak', polygon: [{ x: -200, z: -150 }, { x: 0, z: -150 }, { x: 0, z: 150 }, { x: -200, z: 150 }] },
        { id: 'right', name: 'Right', floor: 'tile', polygon: [{ x: 0, z: -150 }, { x: 200, z: -150 }, { x: 200, z: 150 }, { x: 0, z: 150 }] }
      ]
    },
    assets: [{ id: 'a', name: 'piece', uri: 'piece.glb', dimensions: { width: piece.width, depth: piece.depth, height: piece.height ?? 80 }, source: { kind: 'upload' } }],
    items: [{ id: 'p', assetId: 'a', position: { x: piece.x, y: 0, z: piece.z }, rotationY: piece.rotationY ?? 0 }]
  }
}

describe('AC-30 placement in plan rooms', () => {
  it.for([
    { name: 'a piece inside one zone, clear of walls', piece: { width: 80, depth: 60, x: -100, z: 0 }, expected: [] },
    { name: 'a piece flush against the inner face of a wall', piece: { width: 80, depth: 60, x: -150, z: 112.5 }, expected: [] },
    { name: 'a piece straddling the solid part of the middle wall', piece: { width: 60, depth: 40, x: 0, z: 100 }, expected: ['hits-wall'] },
    { name: 'a piece standing in the doorway', piece: { width: 40, depth: 40, x: 0, z: 0 }, expected: [] },
    { name: 'a piece turned to cross the doorway edge', piece: { width: 120, depth: 30, x: 0, z: -40, rotationY: 90 }, expected: ['hits-wall'] },
    { name: 'a piece pushed through the outer wall', piece: { width: 40, depth: 40, x: 190, z: 0 }, expected: ['outside-room', 'hits-wall'] },
    { name: 'a piece outside the house', piece: { width: 40, depth: 40, x: 400, z: 0 }, expected: ['outside-room'] },
    { name: 'a piece taller than the walls', piece: { width: 40, depth: 40, height: 260, x: -100, z: 0 }, expected: ['above-ceiling'] }
  ])('AC-30 $name', ({ piece, expected }) => {
    expect(outOfBounds(planWith(piece))).toEqual(expected.map((reason) => ({ itemId: 'p', reason })))
  })

  it('AC-30 the demo house is furnished without problems', () => {
    expect(outOfBounds(house)).toEqual([])
  })
})
