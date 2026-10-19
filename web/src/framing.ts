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

/** An eye-level camera standing just inside the zone corner farthest from the subject (else the largest item), aimed between the subject and the zone centre (else at the centre). */
export function eyeLevelCamera(
  polygon: readonly { x: number; z: number }[],
  footprints: readonly Footprint[],
  subject?: { x: number; z: number }
): { position: Vec3; target: Vec3 } {
  const center = boundsCenter(polygonBounds(polygon))
  const largest = footprints.reduce<Footprint | undefined>((best, footprint) => (best && best.area >= footprint.area ? best : footprint), undefined)
  const anchor = subject ?? largest ?? center
  const corner = polygon.reduce((far, vertex) =>
    Math.hypot(vertex.x - anchor.x, vertex.z - anchor.z) > Math.hypot(far.x - anchor.x, far.z - anchor.z) ? vertex : far
  )
  const aim = subject ? { x: (subject.x + center.x) / 2, z: (subject.z + center.z) / 2 } : center
  return {
    position: { x: towards(corner.x, center.x, EYE_INSET_CM), y: EYE_HEIGHT_CM, z: towards(corner.z, center.z, EYE_INSET_CM) },
    target: { x: aim.x, y: EYE_TARGET_HEIGHT_CM, z: aim.z }
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

const AERIAL_PITCH_DEG = 45
const AERIAL_FILL = 0.65
const AERIAL_FITTING_STEPS = 12
const STREET_EYE_CM = 160
const STREET_TARGET_HEIGHT_CM = 140
const STREET_LOT_INSET_CM = 50

export type Lens = { fovDeg: number; aspect: number }
type Pose = { position: Vec3; target: Vec3 }
type Point = { x: number; z: number }

function unit({ x, y, z }: Vec3): Vec3 {
  const length = Math.hypot(x, y, z)
  return { x: x / length, y: y / length, z: z / length }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function between(from: Vec3, to: Vec3): Vec3 {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }
}

function viewDepth({ position, target }: Pose, point: Vec3): number {
  return dot(between(position, point), unit(between(position, target)))
}

function projected({ position, target }: Pose, { fovDeg, aspect }: Lens, point: Vec3): { x: number; y: number } {
  const forward = unit(between(position, target))
  const right = unit({ x: -forward.z, y: 0, z: forward.x })
  const up = { x: right.y * forward.z - right.z * forward.y, y: right.z * forward.x - right.x * forward.z, z: right.x * forward.y - right.y * forward.x }
  const toPoint = between(position, point)
  const tan = Math.tan((fovDeg * Math.PI) / 360)
  const depth = dot(toPoint, forward)
  return { x: dot(toPoint, right) / (depth * tan * aspect), y: dot(toPoint, up) / (depth * tan) }
}

/** The eight corners of a floor-plan extent from the floor up to a height in cm. */
export function boxCorners({ min, max }: Bounds, topCm: number): Vec3[] {
  return [min.x, max.x].flatMap((x) => [min.z, max.z].flatMap((z) => [0, topCm].map((y) => ({ x, y, z }))))
}

function frameFill(pose: Pose, lens: Lens, points: readonly Vec3[]): number {
  const projections = points.map((point) => projected(pose, lens, point))
  const halfSpan = (axis: 'x' | 'y') => (Math.max(...projections.map((point) => point[axis])) - Math.min(...projections.map((point) => point[axis]))) / 2
  return Math.max(halfSpan('x'), halfSpan('y'))
}

/** An aerial three-quarter camera from the south-east at 45° pitch, aimed at the house centre, at the distance where the house (floor to roof) fills 65 % of the frame. */
export function aerialCamera(house: Bounds, topCm: number, lens: Lens): Pose {
  const target = { ...boundsCenter(house), y: topCm / 2 }
  const direction = compassDirection(STUDIO_AZIMUTH_DEG, AERIAL_PITCH_DEG)
  const at = (distance: number): Pose => ({ position: { x: target.x + direction.x * distance, y: target.y + direction.y * distance, z: target.z + direction.z * distance }, target })
  const corners = boxCorners(house, topCm)
  const distance = Array.from({ length: AERIAL_FITTING_STEPS }).reduce<number>(
    (current) => (current * frameFill(at(current), lens, corners)) / AERIAL_FILL,
    4 * Math.hypot(house.max.x - house.min.x, house.max.z - house.min.z, topCm)
  )
  return at(distance)
}

/** A street camera at 160 cm on the lot corner in front of the door that is diagonal to the house (outside its x and z extents), nearest the door, aimed at the house. */
export function streetCamera(door: { point: Point; outward: Point }, lot: readonly Point[], house: Bounds): Pose {
  const center = boundsCenter(house)
  const diagonal = ({ x, z }: Point) => (x < house.min.x || x > house.max.x) && (z < house.min.z || z > house.max.z)
  const inFront = ({ x, z }: Point) => (x - door.point.x) * door.outward.x + (z - door.point.z) * door.outward.z > 0
  const fromDoor = ({ x, z }: Point) => Math.hypot(x - door.point.x, z - door.point.z)
  const rank = (corner: Point) => (inFront(corner) ? 0 : 2) + (diagonal(corner) ? 0 : 1)
  const corner = lot.reduce((best, vertex) => (rank(vertex) < rank(best) || (rank(vertex) === rank(best) && fromDoor(vertex) < fromDoor(best)) ? vertex : best))
  const inset = { x: towards(corner.x, center.x, STREET_LOT_INSET_CM), z: towards(corner.z, center.z, STREET_LOT_INSET_CM) }
  const { x, z } = diagonal(inset) ? inset : corner
  return { position: { x, y: STREET_EYE_CM, z }, target: { x: center.x, y: STREET_TARGET_HEIGHT_CM, z: center.z } }
}

/** Depth range of an exterior shot along the view axis: from the nearest house corner to the farthest lot corner. */
export function exteriorDepthRange(pose: Pose, houseCorners: readonly Vec3[], lot: readonly Point[]): { nearCm: number; farCm: number } {
  return {
    nearCm: Math.min(...houseCorners.map((corner) => viewDepth(pose, corner))),
    farCm: Math.max(...lot.map(({ x, z }) => viewDepth(pose, { x, y: 0, z })))
  }
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
