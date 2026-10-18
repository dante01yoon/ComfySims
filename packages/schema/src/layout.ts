import { z } from 'zod'

const centimeters = z.number().finite()
const positiveCentimeters = centimeters.positive()

export const Dimensions = z.strictObject({
  width: positiveCentimeters,
  depth: positiveCentimeters,
  height: positiveCentimeters
})

export const BoxRoom = z.strictObject({
  kind: z.literal('box'),
  width: positiveCentimeters,
  depth: positiveCentimeters,
  height: positiveCentimeters
})

const Point = z.strictObject({ x: centimeters, z: centimeters })

export const Wall = z.strictObject({ id: z.string().min(1), from: Point, to: Point })

export const Opening = z.strictObject({
  wallId: z.string().min(1),
  kind: z.enum(['door', 'window']),
  offset: centimeters.min(0),
  width: positiveCentimeters,
  height: positiveCentimeters,
  sill: centimeters.min(0)
})

export const FloorMaterial = z.enum(['oak', 'walnut', 'tile', 'concrete', 'carpet'])

export const Zone = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  polygon: z.array(Point).min(3),
  floor: FloorMaterial
})

export const PlanRoom = z.strictObject({
  kind: z.literal('plan'),
  wallHeight: positiveCentimeters,
  wallThickness: positiveCentimeters,
  walls: z.array(Wall).min(1),
  openings: z.array(Opening),
  zones: z.array(Zone).min(1)
})

export const Room = z.discriminatedUnion('kind', [BoxRoom, PlanRoom])

const wallLength = (wall: z.infer<typeof Wall>) => Math.hypot(wall.to.x - wall.from.x, wall.to.z - wall.from.z)

export const AssetSource = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('upload') }),
  z.strictObject({
    kind: z.literal('generated'),
    workflow: z.string().min(1),
    productUrl: z.url().optional()
  })
])

export const FitMode = z.enum(['exact', 'uniform', 'auto'])

export const AssetFit = z.strictObject({
  mode: FitMode,
  distortion: z.number().finite().min(1)
})

export const Asset = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  uri: z.string().min(1),
  dimensions: Dimensions,
  source: AssetSource,
  fit: AssetFit.optional()
})

export const PlacedItem = z.strictObject({
  id: z.string().min(1),
  assetId: z.string().min(1),
  position: z.strictObject({ x: centimeters, y: centimeters, z: centimeters }),
  rotationY: z.number().finite().min(0).lt(360)
})

function duplicateIds(entries: readonly { id: string }[]): string[] {
  const seen = new Set<string>()
  return entries.flatMap(({ id }) => {
    if (seen.has(id)) return [id]
    seen.add(id)
    return []
  })
}

export const RoomLayout = z
  .strictObject({
    version: z.literal(1),
    id: z.string().min(1),
    name: z.string().min(1),
    units: z.literal('cm'),
    room: Room,
    assets: z.array(Asset),
    items: z.array(PlacedItem)
  })
  .superRefine((layout, ctx) => {
    for (const id of duplicateIds(layout.assets)) {
      ctx.addIssue({ code: 'custom', path: ['assets'], message: `duplicate asset id "${id}"` })
    }
    for (const id of duplicateIds(layout.items)) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: `duplicate item id "${id}"` })
    }
    if (layout.room.kind === 'plan') {
      const walls = new Map(layout.room.walls.map((wall) => [wall.id, wall]))
      for (const id of duplicateIds(layout.room.walls)) {
        ctx.addIssue({ code: 'custom', path: ['room', 'walls'], message: `duplicate wall id "${id}"` })
      }
      for (const id of duplicateIds(layout.room.zones)) {
        ctx.addIssue({ code: 'custom', path: ['room', 'zones'], message: `duplicate zone id "${id}"` })
      }
      layout.room.openings.forEach((opening, index) => {
        const wall = walls.get(opening.wallId)
        if (!wall) {
          ctx.addIssue({ code: 'custom', path: ['room', 'openings', index, 'wallId'], message: `unknown wall "${opening.wallId}"` })
          return
        }
        if (opening.offset + opening.width > wallLength(wall) + 0.001) {
          ctx.addIssue({ code: 'custom', path: ['room', 'openings', index, 'width'], message: 'opening runs past the end of its wall' })
        }
        if (opening.sill + opening.height > (layout.room.kind === 'plan' ? layout.room.wallHeight : 0) + 0.001) {
          ctx.addIssue({ code: 'custom', path: ['room', 'openings', index, 'height'], message: 'opening is taller than the wall' })
        }
      })
    }
    const assetIds = new Set(layout.assets.map((asset) => asset.id))
    layout.items.forEach((item, index) => {
      if (!assetIds.has(item.assetId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'assetId'],
          message: `unknown asset "${item.assetId}"`
        })
      }
    })
  })

export type Dimensions = z.infer<typeof Dimensions>
export type Room = z.infer<typeof Room>
export type BoxRoom = z.infer<typeof BoxRoom>
export type PlanRoom = z.infer<typeof PlanRoom>
export type Wall = z.infer<typeof Wall>
export type Opening = z.infer<typeof Opening>
export type Zone = z.infer<typeof Zone>
export type FloorMaterial = z.infer<typeof FloorMaterial>
export type FitMode = z.infer<typeof FitMode>
export type AssetFit = z.infer<typeof AssetFit>
export type Asset = z.infer<typeof Asset>
export type PlacedItem = z.infer<typeof PlacedItem>
export type RoomLayout = z.infer<typeof RoomLayout>

export type ParseOutcome =
  | { ok: true; layout: RoomLayout }
  | { ok: false; issues: { path: string; message: string }[] }

export function parseLayout(input: unknown): ParseOutcome {
  const result = RoomLayout.safeParse(input)
  if (result.success) return { ok: true, layout: result.data }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    }))
  }
}

export function serializeLayout(layout: RoomLayout): string {
  return JSON.stringify(RoomLayout.parse(layout), null, 2)
}
