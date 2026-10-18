import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { expectedSeconds } from '../packages/comfy/src/index.ts'
import { itemsInZone } from '../packages/placement/src/index.ts'
import { DEFAULT_EXPECTED_SECONDS } from '../packages/schema/src/index.ts'
import type { Job, JobKind, RoomLayout } from '../packages/schema/src/index.ts'

const finished = (kind: JobKind, seconds: number, last: 'done' | 'failed' = 'done'): Job => ({
  id: `${kind}-${seconds}-${last}`,
  kind,
  title: kind,
  steps: [{ status: 'uploading', at: 1_000 }, { status: last, at: 1_000 + seconds * 1000 }]
})
const running = (kind: JobKind): Job => ({ id: `${kind}-running`, kind, title: kind, steps: [{ status: 'generating', at: 5_000 }] })

describe('AC-49 expected seconds', () => {
  it.for([
    { name: 'no finished jobs yet', jobs: [], kind: 'product', expected: DEFAULT_EXPECTED_SECONDS.product },
    { name: 'the median of an odd count', jobs: [finished('product', 50), finished('product', 90), finished('product', 70)], kind: 'product', expected: 70 },
    { name: 'the median of an even count', jobs: [finished('render', 10), finished('render', 20)], kind: 'render', expected: 15 },
    { name: 'failed and running jobs ignored', jobs: [finished('render', 10), finished('render', 99, 'failed'), running('render')], kind: 'render', expected: 10 },
    { name: 'other kinds ignored', jobs: [finished('render', 10)], kind: 'photo3d', expected: DEFAULT_EXPECTED_SECONDS.photo3d }
  ])('AC-49 uses $name', ({ jobs, kind, expected }) => {
    expect(expectedSeconds(jobs as Job[], kind as JobKind)).toBe(expected)
  })
})

describe('AC-50 items in a zone', () => {
  const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))

  it.for([
    { zone: 'living', count: 4 }, { zone: 'kitchen', count: 3 }, { zone: 'bedroom', count: 3 },
    { zone: 'office', count: 3 }, { zone: 'bath', count: 1 }, { zone: 'garage', count: 1 }
  ])('AC-50 counts $count items in $zone of the demo house', ({ zone, count }) => {
    expect(itemsInZone(house, zone)).toHaveLength(count)
  })

  it('AC-50 uses the polygon, not its bounding box', () => {
    const lShape: RoomLayout = {
      ...house,
      room: house.room.kind === 'plan'
        ? { ...house.room, zones: [{ id: 'l', name: 'L', floor: 'oak', polygon: [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 100 }, { x: 100, z: 100 }, { x: 100, z: 400 }, { x: 0, z: 400 }] }] }
        : house.room,
      items: [
        { id: 'in-arm', assetId: house.assets[0]!.id, position: { x: 50, y: 0, z: 300 }, rotationY: 0 },
        { id: 'in-notch', assetId: house.assets[0]!.id, position: { x: 300, y: 0, z: 300 }, rotationY: 0 }
      ]
    }
    expect(itemsInZone(lShape, 'l')).toEqual(['in-arm'])
  })
})
