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

export const Room = z.discriminatedUnion('kind', [BoxRoom])

export const AssetSource = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('upload') }),
  z.strictObject({
    kind: z.literal('generated'),
    workflow: z.string().min(1),
    productUrl: z.url().optional()
  })
])

export const FitMode = z.enum(['exact', 'uniform'])

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
