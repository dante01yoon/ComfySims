import type { BoxRoom, Dimensions, Opening, PlacedItem, PlanRoom, RoomLayout, Wall } from '../../schema/src/index.ts'

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

function overlaps(a: Point[], b: Point[]): boolean {
  return [...edgeNormals(a), ...edgeNormals(b)].every((axis) => {
    const rangeA = projectionRange(a, axis)
    const rangeB = projectionRange(b, axis)
    return Math.min(rangeA.max, rangeB.max) - Math.max(rangeA.min, rangeB.min) > TOUCH_TOLERANCE_CM
  })
}

/** Pairs of placed items whose listed footprints overlap, each pair once with a < b, sorted. */
export function collisions(layout: RoomLayout): { a: string; b: string }[] {
  const sorted = footprints(layout).sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  return sorted.flatMap((first, index) =>
    sorted
      .slice(index + 1)
      .filter((second) => overlaps(first.corners, second.corners))
      .map((second) => ({ a: first.id, b: second.id }))
  )
}

export type OutOfBoundsReason = 'outside-room' | 'hits-wall' | 'above-ceiling'

type Bounds = { outside: (corner: Point) => boolean; hitsWall: (corners: Point[]) => boolean; ceiling: number }

function boxBounds(room: BoxRoom): Bounds {
  const halfWidth = room.width / 2 + TOUCH_TOLERANCE_CM
  const halfDepth = room.depth / 2 + TOUCH_TOLERANCE_CM
  return {
    outside: ({ x, z }) => Math.abs(x) > halfWidth || Math.abs(z) > halfDepth,
    hitsWall: () => false,
    ceiling: room.height
  }
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz))
}

function inPolygon(point: Point, polygon: readonly Point[]): boolean {
  const edges = polygon.map((corner, index) => [corner, polygon[(index + 1) % polygon.length]!] as const)
  if (edges.some(([a, b]) => distanceToSegment(point, a, b) <= TOUCH_TOLERANCE_CM)) return true
  const crossings = edges.filter(([a, b]) => a.z > point.z !== b.z > point.z && point.x < a.x + ((point.z - a.z) * (b.x - a.x)) / (b.z - a.z))
  return crossings.length % 2 === 1
}

/** Solid stretches of a wall's centre line as [start, end] distances from `from`, minus openings of the given kinds (doors by default). */
export function solidStretches(wall: Wall, openings: readonly Opening[], kinds: readonly Opening['kind'][] = ['door']): [number, number][] {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.z - wall.from.z)
  const gaps = openings
    .filter((opening) => opening.wallId === wall.id && kinds.includes(opening.kind))
    .map((opening) => [opening.offset, opening.offset + opening.width] as const)
    .sort(([a], [b]) => a - b)
  const stretches: [number, number][] = []
  let start = 0
  for (const [gapStart, gapEnd] of gaps) {
    if (gapStart > start) stretches.push([start, gapStart])
    start = Math.max(start, gapEnd)
  }
  if (length > start) stretches.push([start, length])
  return stretches
}

function wallRectangle(wall: Wall, [start, end]: [number, number], thickness: number): Point[] {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.z - wall.from.z)
  const along = { x: (wall.to.x - wall.from.x) / length, z: (wall.to.z - wall.from.z) / length }
  const across = { x: (-along.z * thickness) / 2, z: (along.x * thickness) / 2 }
  const at = (distance: number, side: 1 | -1) => ({
    x: wall.from.x + along.x * distance + across.x * side,
    z: wall.from.z + along.z * distance + across.z * side
  })
  return [at(start, -1), at(end, -1), at(end, 1), at(start, 1)]
}

function planBounds(room: PlanRoom): Bounds {
  const solids = room.walls.flatMap((wall) =>
    solidStretches(wall, room.openings).map((stretch) => wallRectangle(wall, stretch, room.wallThickness))
  )
  return {
    outside: (corner) => !room.zones.some((zone) => inPolygon(corner, zone.polygon)),
    hitsWall: (corners) => solids.some((solid) => overlaps(corners, solid)),
    ceiling: room.wallHeight
  }
}

/** Items whose listed footprint leaves the room (or its zones), hits a solid wall, or whose top exceeds the ceiling. */
export function outOfBounds(layout: RoomLayout): { itemId: string; reason: OutOfBoundsReason }[] {
  const bounds = layout.room.kind === 'plan' ? planBounds(layout.room) : boxBounds(layout.room)
  return footprints(layout).flatMap((item) => {
    const reasons: OutOfBoundsReason[] = [
      ...(item.corners.some(bounds.outside) ? ['outside-room' as const] : []),
      ...(bounds.hitsWall(item.corners) ? ['hits-wall' as const] : []),
      ...(item.top > bounds.ceiling + TOUCH_TOLERANCE_CM ? ['above-ceiling' as const] : [])
    ]
    return reasons.map((reason) => ({ itemId: item.id, reason }))
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
