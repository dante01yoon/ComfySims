import { houseExtent, solidStretches } from '../../packages/placement/src/index.ts'
import type { FloorMaterial, Opening, PlacedItem, Room, RoomLayout, Wall } from '../../packages/schema/src/index.ts'
import { polygonBounds, polygonCentroid } from './framing.ts'

type Point = { x: number; z: number }

const MAX_SIDE_PX = 2400
const MAX_PX_PER_CM = 2
const MARGIN_PX = 80
const TITLE_PX = 26
const LABEL_PX = 18
const SIZE_PX = 14
const SCALE_BAR_CM = 100
const BOX_WALL_CM = 10
const FONT = 'system-ui, -apple-system, sans-serif'
const INK = '#1c1c1e'
const MUTED = '#5b5f66'
const ITEM_FILL = 'rgba(120, 128, 138, .28)'
const ITEM_EDGE = '#6b737d'
const WINDOW_INK = '#3d7fd6'
const FLOOR_TINTS: Record<FloorMaterial, string> = {
  oak: '#f1e3c9',
  walnut: '#e3cdb4',
  tile: '#e6ebee',
  concrete: '#e2e1de',
  carpet: '#ebe2ea'
}

type PlanRoomShape = { name: string; polygon: Point[]; floor: FloorMaterial }
type WallStroke = { from: Point; to: Point }

function roomSizeLabel(polygon: readonly Point[]): string {
  const { min, max } = polygonBounds(polygon)
  return `${Math.round(max.x - min.x)} × ${Math.round(max.z - min.z)} cm`
}

function roomShapes(layout: RoomLayout): PlanRoomShape[] {
  const { room } = layout
  if (room.kind === 'plan') return room.zones.map((zone) => ({ name: zone.name, polygon: zone.polygon, floor: zone.floor }))
  const { min, max } = houseExtent(room)
  return [{ name: layout.name, polygon: [min, { x: max.x, z: min.z }, max, { x: min.x, z: max.z }], floor: 'oak' }]
}

function along(wall: Wall, distance: number): Point {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.z - wall.from.z)
  const t = distance / length
  return { x: wall.from.x + (wall.to.x - wall.from.x) * t, z: wall.from.z + (wall.to.z - wall.from.z) * t }
}

function strokesOf(room: Room, kinds: readonly Opening['kind'][]): WallStroke[] {
  if (room.kind === 'box') {
    const { min, max } = houseExtent(room)
    const corners = [min, { x: max.x, z: min.z }, max, { x: min.x, z: max.z }]
    return corners.map((from, index) => ({ from, to: corners[(index + 1) % corners.length]! }))
  }
  return room.walls.flatMap((wall) => solidStretches(wall, room.openings, kinds).map(([start, end]) => ({ from: along(wall, start), to: along(wall, end) })))
}

function windowStrokes(room: Room): WallStroke[] {
  if (room.kind === 'box') return []
  const wallsById = new Map(room.walls.map((wall) => [wall.id, wall]))
  return room.openings.flatMap((opening) => {
    const wall = wallsById.get(opening.wallId)
    if (opening.kind !== 'window' || !wall) return []
    return [{ from: along(wall, opening.offset), to: along(wall, opening.offset + opening.width) }]
  })
}

function itemCorners(item: PlacedItem, width: number, depth: number): Point[] {
  const angle = (item.rotationY * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const local = [
    { x: -width / 2, z: -depth / 2 },
    { x: width / 2, z: -depth / 2 },
    { x: width / 2, z: depth / 2 },
    { x: -width / 2, z: depth / 2 }
  ]
  return local.map(({ x, z }) => ({ x: item.position.x + x * cos + z * sin, z: item.position.z - x * sin + z * cos }))
}

function itemOutlines(layout: RoomLayout): Point[][] {
  const dimensionsByAsset = new Map(layout.assets.map((asset) => [asset.id, asset.dimensions]))
  return layout.items.flatMap((item) => {
    const dimensions = dimensionsByAsset.get(item.assetId)
    return dimensions ? [itemCorners(item, dimensions.width, dimensions.depth)] : []
  })
}

type Frame = { pxPerCm: number; width: number; height: number; toPx: (point: Point) => [number, number] }

function frameOf(room: Room): Frame {
  const { min, max } = houseExtent(room)
  const spanX = max.x - min.x
  const spanZ = max.z - min.z
  const pxPerCm = Math.min(MAX_PX_PER_CM, (MAX_SIDE_PX - 2 * MARGIN_PX) / Math.max(spanX, spanZ))
  const top = MARGIN_PX + TITLE_PX * 2
  return {
    pxPerCm,
    width: Math.ceil(spanX * pxPerCm + 2 * MARGIN_PX),
    height: Math.ceil(spanZ * pxPerCm + top + MARGIN_PX + SIZE_PX * 3),
    toPx: ({ x, z }) => [MARGIN_PX + (x - min.x) * pxPerCm, top + (z - min.z) * pxPerCm]
  }
}

function tracePolygon(context: CanvasRenderingContext2D, frame: Frame, polygon: readonly Point[]): void {
  context.beginPath()
  polygon.forEach((point, index) => {
    const [x, y] = frame.toPx(point)
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.closePath()
}

function strokeSegments(context: CanvasRenderingContext2D, frame: Frame, segments: readonly WallStroke[]): void {
  context.beginPath()
  for (const { from, to } of segments) {
    context.moveTo(...frame.toPx(from))
    context.lineTo(...frame.toPx(to))
  }
  context.stroke()
}

function drawRooms(context: CanvasRenderingContext2D, frame: Frame, rooms: readonly PlanRoomShape[]): void {
  for (const room of rooms) {
    tracePolygon(context, frame, room.polygon)
    context.fillStyle = FLOOR_TINTS[room.floor]
    context.fill()
  }
}

function drawWalls(context: CanvasRenderingContext2D, frame: Frame, room: Room): void {
  const thickness = room.kind === 'plan' ? room.wallThickness : BOX_WALL_CM
  context.lineCap = 'square'
  context.strokeStyle = INK
  context.lineWidth = Math.max(2, thickness * frame.pxPerCm)
  strokeSegments(context, frame, strokesOf(room, ['door', 'window']))
  context.lineCap = 'butt'
  context.strokeStyle = WINDOW_INK
  context.lineWidth = Math.max(1.5, thickness * frame.pxPerCm * 0.35)
  strokeSegments(context, frame, windowStrokes(room))
}

function drawItems(context: CanvasRenderingContext2D, frame: Frame, outlines: readonly Point[][]): void {
  context.lineWidth = 1.5
  context.strokeStyle = ITEM_EDGE
  context.fillStyle = ITEM_FILL
  for (const outline of outlines) {
    tracePolygon(context, frame, outline)
    context.fill()
    context.stroke()
  }
}

function drawRoomLabels(context: CanvasRenderingContext2D, frame: Frame, rooms: readonly PlanRoomShape[]): void {
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (const room of rooms) {
    const [x, y] = frame.toPx(polygonCentroid(room.polygon))
    context.fillStyle = INK
    context.font = `600 ${LABEL_PX}px ${FONT}`
    context.fillText(room.name, x, y - LABEL_PX * 0.6)
    context.fillStyle = MUTED
    context.font = `${SIZE_PX}px ${FONT}`
    context.fillText(roomSizeLabel(room.polygon), x, y + SIZE_PX * 0.8)
  }
}

function drawTitleAndScale(context: CanvasRenderingContext2D, frame: Frame, layout: RoomLayout): void {
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = INK
  context.font = `700 ${TITLE_PX}px ${FONT}`
  context.fillText(layout.name, MARGIN_PX, MARGIN_PX)
  context.fillStyle = MUTED
  context.font = `${SIZE_PX}px ${FONT}`
  context.fillText('Floor plan · top view · north up · sizes are room width × depth', MARGIN_PX, MARGIN_PX + TITLE_PX)
  const barY = frame.height - MARGIN_PX / 2
  const barEnd = MARGIN_PX + SCALE_BAR_CM * frame.pxPerCm
  context.strokeStyle = INK
  context.lineWidth = 3
  context.beginPath()
  context.moveTo(MARGIN_PX, barY)
  context.lineTo(barEnd, barY)
  context.stroke()
  context.fillStyle = INK
  context.fillText(`${SCALE_BAR_CM} cm`, barEnd + 10, barY + SIZE_PX / 3)
}

function drawPlan(context: CanvasRenderingContext2D, frame: Frame, layout: RoomLayout): void {
  const rooms = roomShapes(layout)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, frame.width, frame.height)
  drawRooms(context, frame, rooms)
  drawItems(context, frame, itemOutlines(layout))
  drawWalls(context, frame, layout.room)
  drawRoomLabels(context, frame, rooms)
  drawTitleAndScale(context, frame, layout)
}

/** Top-down floor plan of the layout as a PNG: rooms with name and width × depth in cm, walls, windows and furniture outlines. */
export async function planPng(layout: RoomLayout): Promise<Blob | null> {
  const frame = frameOf(layout.room)
  const canvas = document.createElement('canvas')
  canvas.width = frame.width
  canvas.height = frame.height
  const context = canvas.getContext('2d')
  if (!context) return null
  drawPlan(context, frame, layout)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
