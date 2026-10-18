import type { BoxRoom, Dimensions, FindSpotOutcome, Opening, PlacedItem, PlanRoom, Room, RoomLayout, Wall } from '../../schema/src/index.ts'

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

/** Ids of the items whose footprint centre lies inside the zone's polygon; empty for an unknown zone or a box room. */
export function itemsInZone(layout: RoomLayout, zoneId: string): string[] {
  const zone = layout.room.kind === 'plan' ? layout.room.zones.find(({ id }) => id === zoneId) : undefined
  return zone ? layout.items.filter(({ position }) => inPolygon(position, zone.polygon)).map(({ id }) => id) : []
}

/** The first zone whose polygon contains the point, or null. */
export function zoneAt(layout: RoomLayout, point: Point): string | null {
  return layout.room.kind === 'plan' ? (layout.room.zones.find(({ polygon }) => inPolygon(point, polygon))?.id ?? null) : null
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

type Enclosure = { walls: readonly Wall[]; openings: readonly Opening[]; thickness: number; zone: readonly Point[] }
type WallSide = { wall: Wall; stretch: [number, number]; inward: Point }

const SPOT_STEP_CM = 5
const WALL_CLEARANCE_CM = 0.1
const PROBE_ID = '\u0000find-spot'

function enclosure(room: Room, zoneId: string): Enclosure | null {
  if (room.kind === 'plan') {
    const zone = room.zones.find(({ id }) => id === zoneId)
    return zone ? { walls: room.walls, openings: room.openings, thickness: room.wallThickness, zone: zone.polygon } : null
  }
  const corners = [
    { x: -room.width / 2, z: -room.depth / 2 },
    { x: room.width / 2, z: -room.depth / 2 },
    { x: room.width / 2, z: room.depth / 2 },
    { x: -room.width / 2, z: room.depth / 2 }
  ]
  const walls = corners.map((from, index) => ({ id: ['north', 'east', 'south', 'west'][index]!, from, to: corners[(index + 1) % 4]! }))
  return { walls, openings: [], thickness: 0, zone: corners }
}

function wallAxis(wall: Wall): { along: Point; length: number } {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.z - wall.from.z)
  return { along: { x: (wall.to.x - wall.from.x) / length, z: (wall.to.z - wall.from.z) / length }, length }
}

function sidesFacingZone({ walls, openings, zone }: Enclosure): WallSide[] {
  const edges = zone.map((corner, index) => [corner, zone[(index + 1) % zone.length]!] as const)
  return walls.flatMap((wall) => {
    const { along, length } = wallAxis(wall)
    const project = (point: Point) => (point.x - wall.from.x) * along.x + (point.z - wall.from.z) * along.z
    const offLine = (point: Point) => Math.abs((point.x - wall.from.x) * along.z - (point.z - wall.from.z) * along.x)
    const normal = { x: -along.z, z: along.x }
    return edges
      .filter(([a, b]) => offLine(a) <= TOUCH_TOLERANCE_CM && offLine(b) <= TOUCH_TOLERANCE_CM)
      .flatMap(([a, b]) => {
        const low = Math.max(0, Math.min(project(a), project(b)))
        const high = Math.min(length, Math.max(project(a), project(b)))
        return solidStretches(wall, openings, ['door', 'window'])
          .map(([start, end]): [number, number] => [Math.max(start, low), Math.min(end, high)])
          .filter(([start, end]) => end > start)
      })
      .map((stretch) => {
        const middle = (stretch[0] + stretch[1]) / 2
        const probe = { x: wall.from.x + along.x * middle + normal.x, z: wall.from.z + along.z * middle + normal.z }
        return { wall, stretch, inward: inPolygon(probe, zone) ? normal : { x: -normal.x, z: -normal.z } }
      })
  })
}

function offsetsFromMiddle(reach: number): number[] {
  const steps = Math.ceil(reach / SPOT_STEP_CM)
  return [0, ...Array.from({ length: steps }, (_, index) => [(index + 1) * SPOT_STEP_CM, -(index + 1) * SPOT_STEP_CM]).flat()]
}

function candidates({ wall, stretch: [start, end], inward }: WallSide, dimensions: Dimensions, thickness: number): PlacedItem[] {
  const { along } = wallAxis(wall)
  const origin = wall.from.x * along.x + wall.from.z * along.z
  const middle = (start + end) / 2
  const halfWidth = dimensions.width / 2
  const fromWall = thickness / 2 + WALL_CLEARANCE_CM + dimensions.depth / 2
  const rotationY = (((Math.atan2(inward.x, inward.z) * 180) / Math.PI) % 360 + 360) % 360 + 0
  return offsetsFromMiddle((end - start) / 2)
    .map((offset) => snap(origin + middle + offset, SPOT_STEP_CM) - origin)
    .filter((distance) => distance - halfWidth >= start - TOUCH_TOLERANCE_CM && distance + halfWidth <= end + TOUCH_TOLERANCE_CM)
    .map((distance) => ({
      id: PROBE_ID,
      assetId: PROBE_ID,
      position: {
        x: wall.from.x + along.x * distance + inward.x * fromWall,
        y: 0,
        z: wall.from.z + along.z * distance + inward.z * fromWall
      },
      rotationY
    }))
}

function standsFree(layout: RoomLayout, zone: readonly Point[], item: PlacedItem, dimensions: Dimensions): boolean {
  const probed: RoomLayout = {
    ...layout,
    assets: [...layout.assets, { id: PROBE_ID, name: PROBE_ID, uri: PROBE_ID, dimensions, source: { kind: 'upload' } }],
    items: [...layout.items, item]
  }
  return (
    footprint(item, dimensions).corners.every((corner) => inPolygon(corner, zone)) &&
    outOfBounds(probed).every(({ itemId }) => itemId !== PROBE_ID) &&
    collisions(probed).every(({ a, b }) => a !== PROBE_ID && b !== PROBE_ID)
  )
}

/** Where an item of the given size can stand in a zone: back flush against a solid wall, front (+Z) facing the room, clear of everything. */
export function findSpot(layout: RoomLayout, zoneId: string, dimensions: Dimensions): FindSpotOutcome {
  const room = enclosure(layout.room, zoneId)
  if (!room) return { ok: false, reason: 'unknown-zone' }
  const sides = sidesFacingZone(room).sort((a, b) => b.stretch[1] - b.stretch[0] - (a.stretch[1] - a.stretch[0]))
  for (const side of sides) {
    const spot = candidates(side, dimensions, room.thickness).find((item) => standsFree(layout, room.zone, item, dimensions))
    if (spot) return { ok: true, position: spot.position, rotationY: spot.rotationY, wallId: side.wall.id }
  }
  return { ok: false, reason: 'no-space' }
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
