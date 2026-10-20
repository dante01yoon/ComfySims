import { describe, expect, it } from 'vitest'

import type { RoomLayout } from '../../schema/src/index.ts'
import { walkerBlocked, walkerStep, walkObstacles } from './index.ts'

const RADIUS = 25

const twoRooms: RoomLayout = {
  version: 1,
  id: 'two-rooms',
  name: 'Two rooms',
  units: 'cm',
  room: {
    kind: 'plan',
    wallHeight: 250,
    wallThickness: 10,
    walls: [
      { id: 'south', from: { x: 0, z: 400 }, to: { x: 800, z: 400 } },
      { id: 'east', from: { x: 800, z: 400 }, to: { x: 800, z: 0 } },
      { id: 'north', from: { x: 800, z: 0 }, to: { x: 0, z: 0 } },
      { id: 'west', from: { x: 0, z: 0 }, to: { x: 0, z: 400 } },
      { id: 'middle', from: { x: 400, z: 0 }, to: { x: 400, z: 400 } }
    ],
    openings: [
      { wallId: 'middle', kind: 'door', offset: 150, width: 100, height: 210, sill: 0 },
      { wallId: 'east', kind: 'window', offset: 100, width: 200, height: 120, sill: 0 }
    ],
    zones: [
      { id: 'west-room', name: 'West', floor: 'oak', polygon: [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 400 }, { x: 0, z: 400 }] },
      { id: 'east-room', name: 'East', floor: 'tile', polygon: [{ x: 400, z: 0 }, { x: 800, z: 0 }, { x: 800, z: 400 }, { x: 400, z: 400 }] }
    ]
  },
  assets: [
    { id: 'cabinet', name: 'Cabinet', uri: 'cabinet.glb', dimensions: { width: 100, depth: 40, height: 120 }, source: { kind: 'upload' } },
    { id: 'rug', name: 'Rug', uri: 'rug.glb', dimensions: { width: 200, depth: 150, height: 2 }, source: { kind: 'upload' } }
  ],
  items: [
    { id: 'cabinet', assetId: 'cabinet', position: { x: 200, y: 0, z: 100 }, rotationY: 0 },
    { id: 'rug', assetId: 'rug', position: { x: 200, y: 0, z: 300 }, rotationY: 0 }
  ]
}

const obstacles = walkObstacles(twoRooms)

describe('walkerStep', () => {
  it('stops a radius away from a solid wall face', () => {
    const step = walkerStep(obstacles, { x: 300, z: 60 }, { x: 300, z: 0 }, RADIUS)
    expect(step.blocked).toBe(true)
    expect(step.to.x).toBeCloseTo(400 - 5 - RADIUS, 1)
    expect(step.to.x).toBeLessThanOrEqual(370)
  })

  it('passes through a door into the next room', () => {
    const step = walkerStep(obstacles, { x: 300, z: 200 }, { x: 200, z: 0 }, RADIUS)
    expect(step).toEqual({ to: { x: 500, z: 200 }, moved: 200, blocked: false })
  })

  it('treats a window as wall', () => {
    const step = walkerStep(obstacles, { x: 700, z: 200 }, { x: 200, z: 0 }, RADIUS)
    expect(step.blocked).toBe(true)
    expect(step.to.x).toBeLessThanOrEqual(800 - 5 - RADIUS)
  })

  it('is stopped by tall furniture and walks over low furniture', () => {
    const intoCabinet = walkerStep(obstacles, { x: 200, z: 250 }, { x: 0, z: -200 }, RADIUS)
    expect(intoCabinet.blocked).toBe(true)
    expect(intoCabinet.to.z).toBeCloseTo(120 + RADIUS, 1)
    const overRug = walkerStep(obstacles, { x: 100, z: 300 }, { x: 200, z: 0 }, RADIUS)
    expect(overRug.blocked).toBe(false)
  })

  it('slides along a wall when walking into it at an angle', () => {
    const step = walkerStep(obstacles, { x: 300, z: 60 }, { x: 200, z: 50 }, RADIUS)
    expect(step.blocked).toBe(true)
    expect(step.to.x).toBeLessThanOrEqual(370)
    expect(step.to.z).toBeCloseTo(110, 0)
  })

  it('lets a walker that starts overlapping an obstacle move away but not deeper', () => {
    const start = { x: 380, z: 60 }
    expect(walkerBlocked(obstacles, start, RADIUS)).toBe(true)
    expect(walkerStep(obstacles, start, { x: 10, z: 0 }, RADIUS).moved).toBe(0)
    expect(walkerStep(obstacles, start, { x: -50, z: 0 }, RADIUS)).toMatchObject({ moved: 50, blocked: false })
  })
})
