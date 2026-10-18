import type { Dimensions, PlacedItem, RoomLayout } from '../../schema/src/index.ts'

type Point = { x: number; z: number }
type Footprint = { id: string; corners: Point[]; top: number }
type Vec3 = { x: number; y: number; z: number }

const TOUCH_TOLERANCE_CM = 0.001

function footprint(item: PlacedItem, dimensions: Dimensions): Footprint {
  const angle = (item.rotationY * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const halfWidth = dimensions.width / 2
  const halfDepth = dimensions.depth / 2
  const local = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth }
  ]
  return {
    id: item.id,
    corners: local.map(({ x, z }) => ({
      x: item.position.x + x * cos + z * sin,
      z: item.position.z - x * sin + z * cos
    })),
    top: item.position.y + dimensions.height
  }
}

function footprints(layout: RoomLayout): Footprint[] {
  const dimensionsByAsset = new Map(layout.assets.map((asset) => [asset.id, asset.dimensions]))
  return layout.items.flatMap((item) => {
    const dimensions = dimensionsByAsset.get(item.assetId)
    return dimensions ? [footprint(item, dimensions)] : []
  })
}

function edgeNormals(corners: Point[]): Point[] {
  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length]!
    return { x: corner.z - next.z, z: next.x - corner.x }
  })
}

function projectionRange(corners: Point[], axis: Point): { min: number; max: number } {
  const length = Math.hypot(axis.x, axis.z)
  const values = corners.map(({ x, z }) => (x * axis.x + z * axis.z) / length)
  return { min: Math.min(...values), max: Math.max(...values) }
}

function overlaps(a: Footprint, b: Footprint): boolean {
  return [...edgeNormals(a.corners), ...edgeNormals(b.corners)].every((axis) => {
    const rangeA = projectionRange(a.corners, axis)
    const rangeB = projectionRange(b.corners, axis)
    return Math.min(rangeA.max, rangeB.max) - Math.max(rangeA.min, rangeB.min) > TOUCH_TOLERANCE_CM
  })
}

/** Pairs of placed items whose listed footprints overlap, each pair once with a < b, sorted. */
export function collisions(layout: RoomLayout): { a: string; b: string }[] {
  const sorted = footprints(layout).sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  return sorted.flatMap((first, index) =>
    sorted
      .slice(index + 1)
      .filter((second) => overlaps(first, second))
      .map((second) => ({ a: first.id, b: second.id }))
  )
}

/** Items whose listed footprint leaves the room or whose top exceeds the ceiling. */
export function outOfBounds(layout: RoomLayout): { itemId: string; reason: 'outside-room' | 'above-ceiling' }[] {
  const halfWidth = layout.room.width / 2 + TOUCH_TOLERANCE_CM
  const halfDepth = layout.room.depth / 2 + TOUCH_TOLERANCE_CM
  return footprints(layout).flatMap((item) => {
    const outsideRoom = item.corners.some(({ x, z }) => Math.abs(x) > halfWidth || Math.abs(z) > halfDepth)
    const aboveCeiling = item.top > layout.room.height + TOUCH_TOLERANCE_CM
    return [
      ...(outsideRoom ? [{ itemId: item.id, reason: 'outside-room' as const }] : []),
      ...(aboveCeiling ? [{ itemId: item.id, reason: 'above-ceiling' as const }] : [])
    ]
  })
}

function snap(value: number, step: number): number {
  return Math.round(value / step) * step + 0
}

/** Snaps x and z to the floor grid and leaves y untouched. */
export function snapPosition(position: Vec3, stepCm = 5): Vec3 {
  return { x: snap(position.x, stepCm), y: position.y, z: snap(position.z, stepCm) }
}

/** Snaps a rotation to the step and normalizes it to [0, 360). */
export function snapRotation(degrees: number, stepDegrees = 15): number {
  return (((snap(degrees, stepDegrees) % 360) + 360) % 360) + 0
}
