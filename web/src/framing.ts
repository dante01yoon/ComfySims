import type { Room } from '../../packages/schema/src/index.ts'
import type { Vec3 } from '../../spec/contracts/editor-api.ts'

export type Bounds = { min: { x: number; z: number }; max: { x: number; z: number } }

const STUDIO_AZIMUTH_DEG = 135
const HOUSE_ELEVATION_DEG = 47
const ROOM_ELEVATION_DEG = 60
const STUDIO_DISTANCE_PER_RADIUS = 2.6

/** Floor-plan extent of a room in cm. */
export function roomBounds(room: Room): Bounds {
  if (room.kind === 'box') return { min: { x: -room.width / 2, z: -room.depth / 2 }, max: { x: room.width / 2, z: room.depth / 2 } }
  return polygonBounds(room.walls.flatMap((wall) => [wall.from, wall.to]))
}

export function boundsCenter({ min, max }: Bounds): Vec3 {
  return { x: (min.x + max.x) / 2, y: 0, z: (min.z + max.z) / 2 }
}

/** Unit vector toward a compass bearing (0° north = −z, 90° east = +x) raised by an elevation. */
export function compassDirection(azimuthDeg: number, elevationDeg: number): Vec3 {
  const azimuth = (azimuthDeg * Math.PI) / 180
  const elevation = (elevationDeg * Math.PI) / 180
  return { x: Math.sin(azimuth) * Math.cos(elevation), y: Math.sin(elevation), z: -Math.cos(azimuth) * Math.cos(elevation) }
}

/** Area centroid of a simple polygon in cm. */
export function polygonCentroid(polygon: readonly { x: number; z: number }[]): { x: number; z: number } {
  const edges = polygon.map((a, index) => {
    const b = polygon[(index + 1) % polygon.length]!
    return { a, b, cross: a.x * b.z - b.x * a.z }
  })
  const twiceArea = edges.reduce((sum, { cross }) => sum + cross, 0)
  if (twiceArea === 0) return boundsCenter(polygonBounds(polygon))
  const sum = (axis: 'x' | 'z') => edges.reduce((total, { a, b, cross }) => total + (a[axis] + b[axis]) * cross, 0)
  return { x: sum('x') / (3 * twiceArea), z: sum('z') / (3 * twiceArea) }
}

/** Floor-plan extent of a zone polygon in cm. */
export function polygonBounds(polygon: readonly { x: number; z: number }[]): Bounds {
  const xs = polygon.map(({ x }) => x)
  const zs = polygon.map(({ z }) => z)
  return { min: { x: Math.min(...xs), z: Math.min(...zs) }, max: { x: Math.max(...xs), z: Math.max(...zs) } }
}

const EYE_HEIGHT_CM = 150
const EYE_INSET_CM = 40
const EYE_TARGET_HEIGHT_CM = 90

type Footprint = { x: number; z: number; area: number }

function towards(from: number, to: number, step: number): number {
  return from + Math.sign(to - from) * step
}

/** An eye-level camera standing just inside the zone corner farthest from its largest item, looking across the zone. */
export function eyeLevelCamera(polygon: readonly { x: number; z: number }[], footprints: readonly Footprint[]): { position: Vec3; target: Vec3 } {
  const center = boundsCenter(polygonBounds(polygon))
  const largest = footprints.reduce<Footprint | undefined>((best, footprint) => (best && best.area >= footprint.area ? best : footprint), undefined)
  const anchor = largest ?? center
  const corner = polygon.reduce((far, vertex) =>
    Math.hypot(vertex.x - anchor.x, vertex.z - anchor.z) > Math.hypot(far.x - anchor.x, far.z - anchor.z) ? vertex : far
  )
  return {
    position: { x: towards(corner.x, center.x, EYE_INSET_CM), y: EYE_HEIGHT_CM, z: towards(corner.z, center.z, EYE_INSET_CM) },
    target: { x: center.x, y: EYE_TARGET_HEIGHT_CM, z: center.z }
  }
}

type Clearance = { x: number; z: number; half: number }

const STANDING_GRID_CM = 10

function clearOf(point: { x: number; z: number }, clearances: readonly Clearance[]): boolean {
  return clearances.every(({ x, z, half }) => Math.abs(point.x - x) > half || Math.abs(point.z - z) > half)
}

/** Where to stand in a zone: its centroid, or else the nearest 10 cm grid point inside it clear of every item footprint. */
export function standingPoint(
  polygon: readonly { x: number; z: number }[],
  clearances: readonly Clearance[],
  inside: (point: { x: number; z: number }) => boolean
): { x: number; z: number } {
  const centroid = polygonCentroid(polygon)
  if (clearOf(centroid, clearances)) return centroid
  const { min, max } = polygonBounds(polygon)
  const grid = (from: number, to: number) => {
    const first = Math.ceil(from / STANDING_GRID_CM)
    return Array.from({ length: Math.floor(to / STANDING_GRID_CM) - first + 1 }, (_, index) => (first + index) * STANDING_GRID_CM)
  }
  const free = grid(min.x, max.x)
    .flatMap((x) => grid(min.z, max.z).map((z) => ({ x, z })))
    .filter((point) => inside(point) && clearOf(point, clearances))
  const distance = (point: { x: number; z: number }) => Math.hypot(point.x - centroid.x, point.z - centroid.z)
  return free.reduce((best, point) => (distance(point) < distance(best) ? point : best), free[0] ?? centroid)
}

/** The studio camera framing a floor-plan extent from the south-east, steeper for a single room so its walls do not hide it. */
export function studioCamera(bounds: Bounds, framing: 'house' | 'room' = 'house'): { position: Vec3; target: Vec3 } {
  const target = boundsCenter(bounds)
  const distance = (Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2) * STUDIO_DISTANCE_PER_RADIUS
  const direction = compassDirection(STUDIO_AZIMUTH_DEG, framing === 'room' ? ROOM_ELEVATION_DEG : HOUSE_ELEVATION_DEG)
  return {
    position: { x: target.x + direction.x * distance, y: target.y + direction.y * distance, z: target.z + direction.z * distance },
    target
  }
}
