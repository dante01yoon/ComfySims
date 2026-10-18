import { describe, expect, it } from 'vitest'

import { collisions, outOfBounds, snapPosition, snapRotation } from '../packages/placement/src/index.ts'
import type { RoomLayout } from '../packages/schema/src/index.ts'

type Piece = { id: string; width: number; depth: number; height?: number; x: number; z: number; y?: number; rotationY?: number }

function layoutOf(pieces: Piece[], room = { width: 420, depth: 360, height: 240 }): RoomLayout {
  return {
    version: 1,
    id: 'layout-test',
    name: 'test',
    units: 'cm',
    room: { kind: 'box', ...room },
    assets: pieces.map((piece) => ({
      id: `asset-${piece.id}`,
      name: piece.id,
      uri: `${piece.id}.glb`,
      dimensions: { width: piece.width, depth: piece.depth, height: piece.height ?? 80 },
      source: { kind: 'upload' }
    })),
    items: pieces.map((piece) => ({
      id: piece.id,
      assetId: `asset-${piece.id}`,
      position: { x: piece.x, y: piece.y ?? 0, z: piece.z },
      rotationY: piece.rotationY ?? 0
    }))
  }
}

const sofa = { id: 'sofa', width: 200, depth: 90, x: 0, z: 0 }

describe('AC-5 collisions use listed dimensions', () => {
  it.for([
    { name: 'overlapping footprints', pieces: [sofa, { id: 'table', width: 100, depth: 50, x: 100, z: 0 }], expected: [['sofa', 'table']] },
    { name: 'the same pair when the sofa is turned 90°', pieces: [{ ...sofa, rotationY: 90 }, { id: 'table', width: 100, depth: 50, x: 100, z: 0 }], expected: [] },
    { name: 'footprints that only touch', pieces: [{ id: 'a', width: 100, depth: 100, x: 0, z: 0 }, { id: 'b', width: 100, depth: 100, x: 100, z: 0 }], expected: [] },
    { name: 'a 45° square whose bounding box overlaps but whose shape does not', pieces: [{ id: 'diamond', width: 100, depth: 100, x: 0, z: 0, rotationY: 45 }, { id: 'stool', width: 20, depth: 20, x: 60, z: 60 }], expected: [] },
    { name: 'a 45° square whose corner pokes into a stool', pieces: [{ id: 'diamond', width: 100, depth: 100, x: 0, z: 0, rotationY: 45 }, { id: 'stool', width: 20, depth: 20, x: 75, z: 0 }], expected: [['diamond', 'stool']] },
    { name: 'three items with two collisions, reported once each in id order', pieces: [{ id: 'c', width: 50, depth: 50, x: 0, z: 0 }, { id: 'a', width: 50, depth: 50, x: 30, z: 0 }, { id: 'b', width: 50, depth: 50, x: -30, z: 0 }], expected: [['a', 'c'], ['b', 'c']] }
  ])('AC-5 $name', ({ pieces, expected }) => {
    expect(collisions(layoutOf(pieces))).toEqual(expected.map(([a, b]) => ({ a, b })))
  })
})

describe('AC-6 room bounds', () => {
  it.for([
    { name: 'a sofa sticking through the side wall', piece: { ...sofa, x: 120 }, expected: ['outside-room'] },
    { name: 'a sofa flush against the side wall', piece: { ...sofa, x: 110 }, expected: [] },
    { name: 'a turned sofa sticking through the back wall', piece: { ...sofa, z: -90, rotationY: 90 }, expected: ['outside-room'] },
    { name: 'a cabinet taller than the ceiling', piece: { id: 'cabinet', width: 80, depth: 40, height: 250, x: 0, z: 0 }, expected: ['above-ceiling'] },
    { name: 'a shelf hung high enough to hit the ceiling', piece: { id: 'shelf', width: 80, depth: 30, height: 50, y: 200, x: 0, z: 0 }, expected: ['above-ceiling'] },
    { name: 'a shelf exactly reaching the ceiling', piece: { id: 'shelf', width: 80, depth: 30, height: 40, y: 200, x: 0, z: 0 }, expected: [] }
  ])('AC-6 $name', ({ piece, expected }) => {
    expect(outOfBounds(layoutOf([piece]))).toEqual(expected.map((reason) => ({ itemId: piece.id, reason })))
  })
})

describe('AC-7 snapping', () => {
  it.for([
    { input: { x: 12.4, y: 0, z: -7.6 }, expected: { x: 10, y: 0, z: -10 } },
    { input: { x: 2.5, y: 0, z: -2.5 }, expected: { x: 5, y: 0, z: 0 } },
    { input: { x: 0, y: 41, z: 0 }, expected: { x: 0, y: 41, z: 0 } }
  ])('AC-7 snaps $input to the 5 cm floor grid and leaves height alone', ({ input, expected }) => {
    expect(snapPosition(input)).toEqual(expected)
  })

  it.for([
    { input: 7, expected: 0 },
    { input: 8, expected: 15 },
    { input: 352, expected: 345 },
    { input: 353, expected: 0 },
    { input: -20, expected: 345 },
    { input: 725, expected: 0 }
  ])('AC-7 snaps rotation $input° to $expected°', ({ input, expected }) => {
    expect(snapRotation(input)).toBe(expected)
  })
})
