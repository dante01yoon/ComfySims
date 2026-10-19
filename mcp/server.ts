import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

import { studioPrompt } from '../packages/comfy/src/index.ts'
import { itemsInZone, zoneAt } from '../packages/placement/src/index.ts'
import { FitMode, PlanRoom, Site, type AssetProduct, type RoomLayout } from '../packages/schema/src/index.ts'
import type { EditorState, EditorView, ExteriorView, ProductRequest, ScenePreset } from '../spec/contracts/editor-api.ts'
import { editorBridge, type BridgedApi } from './editor.ts'

const SCENE_PRESETS = ['reading', 'work', 'movie', 'evening'] as const satisfies readonly ScenePreset[]
const VIEWS = ['editor', 'studio'] as const satisfies readonly EditorView[]
const EXTERIOR_VIEWS = ['aerial', 'street'] as const satisfies readonly ExteriorView[]
const BLUEPRINT_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const RENDERS_DIR = fileURLToPath(new URL('../.harness/renders/', import.meta.url))

const call = editorBridge({
  url: process.env.ROOMFIT_URL ?? 'http://127.0.0.1:5179',
  tokenFile: fileURLToPath(new URL('../.harness/bridge-token', import.meta.url))
})

type Outcome = { ok: true } | { ok: false; reason?: string; message?: string }

function editorFor(tool: string) {
  return <M extends keyof BridgedApi>(method: M, ...params: Parameters<BridgedApi[M]>) => call(method, params, `mcp:${tool}`)
}

function succeeded<T extends Outcome>(outcome: T): Extract<T, { ok: true }> {
  if (!outcome.ok) throw new Error(outcome.message ?? outcome.reason ?? 'the editor refused')
  return outcome as Extract<T, { ok: true }>
}

function issuesText(issues: readonly { path: string; message: string }[]): string {
  return issues.map(({ path, message }) => `${path || '(root)'}: ${message}`).join('\n')
}

function json(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function zonesOf(layout: RoomLayout) {
  return layout.room.kind === 'plan' ? layout.room.zones : []
}

function zoneIdOf(layout: RoomLayout, room: string): string {
  const wanted = room.trim().toLowerCase()
  const zones = zonesOf(layout)
  const zone = zones.find(({ id, name }) => id.toLowerCase() === wanted || name.toLowerCase() === wanted)
  if (!zone) throw new Error(`There is no room called "${room}". Rooms: ${zones.map(({ name }) => name).join(', ') || 'none'}.`)
  return zone.id
}

function houseOf(state: EditorState) {
  const { layout } = state
  return {
    rooms: zonesOf(layout).map(({ id, name }) => ({ id, name, itemCount: itemsInZone(layout, id).length })),
    items: layout.items.map(({ id, assetId, position, rotationY }) => ({ id, assetId, room: zoneAt(layout, position), position, rotationY })),
    assets: layout.assets,
    problems: { collisions: state.collisions, outOfBounds: state.outOfBounds },
    view: state.view,
    scene: state.scene,
    focusedRoom: state.focusedZone
  }
}

function withoutThumbnail({ photo, ...product }: AssetProduct) {
  return photo?.comfyInputName ? { ...product, photo: { comfyInputName: photo.comfyInputName } } : product
}

function itemOf(state: EditorState, itemId: string) {
  const item = state.layout.items.find(({ id }) => id === itemId)
  if (!item) throw new Error(`There is no item ${itemId}. Call get_house for the item ids.`)
  return item
}

type ProductImage = { comfyInputName: string } | { path: string } | { base64: string }

async function imageOf(image: ProductImage, name: string): Promise<Pick<ProductRequest, 'fileName' | 'imageBase64' | 'imageName'>> {
  if ('comfyInputName' in image) return { fileName: image.comfyInputName, imageName: image.comfyInputName }
  if ('path' in image) return { fileName: basename(image.path), imageBase64: (await readFile(image.path)).toString('base64') }
  return { fileName: `${name.replace(/[^a-z0-9]+/gi, '-') || 'product'}.png`, imageBase64: image.base64 }
}

async function saveRender(jobId: string, base64: string): Promise<string> {
  await mkdir(RENDERS_DIR, { recursive: true })
  const path = join(RENDERS_DIR, `${jobId}.png`)
  await writeFile(path, Buffer.from(base64, 'base64'))
  return path
}

const room = z.string().min(1).describe('A room id or name, case-insensitive, e.g. "bedroom" or "Living room"')
const server = new McpServer({ name: 'roomfit', version: '0.4.0' })

server.registerTool('get_house', { description: 'Describe the house open in the roomfit editor: rooms, placed items, assets, problems (collisions, out of bounds), view, scene and focused room.' }, async () => {
  return json(houseOf(await editorFor('get_house')('state')))
})

server.registerTool(
  'list_assets',
  { description: 'List the asset library of the open house: id, name, real size in cm, source, fit, product (link, brand, store, ComfyUI input of its photo) and labels.' },
  async () => {
    const { layout } = await editorFor('list_assets')('state')
    return json(layout.assets.map(({ id, name, dimensions, source, fit, product, labels }) => ({ id, name, size: dimensions, source, fit, product: product && withoutThumbnail(product), labels })))
  }
)

server.registerTool(
  'set_asset_labels',
  { description: 'Replace the labels of a library asset (every placed copy shares them): up to 12, 1–32 characters, unique ignoring case. Undoable in the editor.', inputSchema: { assetId: z.string().min(1), labels: z.array(z.string()) } },
  async ({ assetId, labels }) => {
    const editor = editorFor('set_asset_labels')
    succeeded(await editor('setAssetLabels', assetId, labels))
    return json({ assetId, labels: (await editor('state')).layout.assets.find(({ id }) => id === assetId)?.labels ?? [] })
  }
)

server.registerTool(
  'place_asset',
  { description: 'Place another copy of a library asset in a room; it goes against a free wall spot. Returns the new item id.', inputSchema: { assetId: z.string().min(1), room } },
  async ({ assetId, room }) => {
    const editor = editorFor('place_asset')
    const zoneId = zoneIdOf((await editor('state')).layout, room)
    return json({ itemId: succeeded(await editor('placeAsset', assetId, zoneId)).itemId })
  }
)

server.registerTool(
  'move_item',
  { description: 'Move a placed item to floor position x, z in cm (house coordinates). Snapping applies; returns the item as placed.', inputSchema: { itemId: z.string().min(1), x: z.number(), z: z.number() } },
  async ({ itemId, x, z }) => {
    const editor = editorFor('move_item')
    itemOf(await editor('state'), itemId)
    await editor('moveItem', itemId, { x, z })
    return json(itemOf(await editor('state'), itemId))
  }
)

server.registerTool(
  'rotate_item',
  { description: 'Set a placed item\'s rotation around the vertical axis to the given degrees. Snapping applies; returns the item.', inputSchema: { itemId: z.string().min(1), degrees: z.number() } },
  async ({ itemId, degrees }) => {
    const editor = editorFor('rotate_item')
    itemOf(await editor('state'), itemId)
    await editor('rotateItem', itemId, degrees)
    return json(itemOf(await editor('state'), itemId))
  }
)

server.registerTool('remove_item', { description: 'Remove a placed item from the house (undoable in the editor).', inputSchema: { itemId: z.string().min(1) } }, async ({ itemId }) => {
  const editor = editorFor('remove_item')
  itemOf(await editor('state'), itemId)
  await editor('removeItem', itemId)
  return json({ removed: itemId })
})

server.registerTool('rename_room', { description: 'Rename a room of the house plan.', inputSchema: { room, name: z.string().min(1) } }, async ({ room, name }) => {
  const editor = editorFor('rename_room')
  const zoneId = zoneIdOf((await editor('state')).layout, room)
  succeeded(await editor('renameZone', zoneId, name))
  return json({ room: zoneId, name: name.trim() })
})

server.registerTool('focus_room', { description: 'Focus the editor camera on one room, or on the whole house when room is left out.', inputSchema: { room: room.optional() } }, async ({ room }) => {
  const editor = editorFor('focus_room')
  const zoneId = room === undefined ? null : zoneIdOf((await editor('state')).layout, room)
  await editor('focusZone', zoneId)
  return json({ focusedRoom: zoneId })
})

server.registerTool('set_scene', { description: 'Set the studio lighting preset: reading, work, movie or evening.', inputSchema: { preset: z.enum(SCENE_PRESETS) } }, async ({ preset }) => {
  await editorFor('set_scene')('setScene', preset)
  return json({ scene: preset })
})

server.registerTool('set_view', { description: 'Switch the editor between the plan editor and the lit studio view.', inputSchema: { view: z.enum(VIEWS) } }, async ({ view }) => {
  await editorFor('set_view')('setView', view)
  return json({ view })
})

server.registerTool(
  'add_product',
  {
    description:
      'Turn a product photo into a 3D model fitted to its listed size (cm) and place it in a room, or with place false only add it to the library (itemId null; place it later with place_asset and the returned assetId). image is { comfyInputName } (a ComfyUI input, e.g. from the Comfy Cloud MCP), { path } (local file) or { base64 }. productUrl (http/https), brand, store and labels are kept on the asset. Waits for the job (about a minute).',
    inputSchema: {
      image: z.union([z.object({ comfyInputName: z.string().min(1) }), z.object({ path: z.string().min(1) }), z.object({ base64: z.string().min(1) })]),
      name: z.string().min(1),
      width: z.number().positive(),
      depth: z.number().positive(),
      height: z.number().positive(),
      room: room.optional(),
      mode: FitMode.optional(),
      productUrl: z.string().optional(),
      brand: z.string().optional(),
      store: z.string().optional(),
      labels: z.array(z.string()).optional(),
      place: z.boolean().optional()
    }
  },
  async ({ image, name, width, depth, height, room, mode, productUrl, brand, store, labels, place }) => {
    const editor = editorFor('add_product')
    const zoneId = room === undefined ? undefined : zoneIdOf((await editor('state')).layout, room)
    const request: ProductRequest = { ...(await imageOf(image, name)), name, dimensions: { width, depth, height }, mode, zoneId, productUrl, brand, store, labels, place }
    const { itemId, assetId, jobId, report } = succeeded(await editor('addProductFromPhoto', request))
    return json({ itemId, assetId, jobId, report })
  }
)

server.registerTool(
  'render_room',
  {
    description: 'Render a room (or the current view) at eye level through ComfyUI. Waits for the job; returns the image and the path of the saved PNG.',
    inputSchema: { room: room.optional(), prompt: z.string().min(1).optional(), preset: z.enum(SCENE_PRESETS).optional() }
  },
  async ({ room, prompt, preset }) => {
    const editor = editorFor('render_room')
    const { layout, scene } = await editor('state')
    const zoneId = room === undefined ? undefined : zoneIdOf(layout, room)
    if (zoneId !== undefined) await editor('focusZone', zoneId)
    if (preset !== undefined) await editor('setScene', preset)
    const roomName = zonesOf(layout).find(({ id }) => id === zoneId)?.name
    const { jobId, image } = succeeded(await editor('renderInComfy', { prompt: prompt ?? studioPrompt(roomName, preset ?? scene) }))
    const data = await editor('base64At', image)
    return { content: [...json({ jobId, path: await saveRender(jobId, data) }).content, { type: 'image', data, mimeType: 'image/png' }] }
  }
)

server.registerTool(
  'view_360',
  {
    description:
      'Generate a photoreal 360° panorama of a room from its standing point, conditioned on the layout, and open it in the editor\'s look-around viewer. A prompt must start with "equirectangular 360 image". Waits for the job (about a minute); returns the image and the path of the saved PNG.',
    inputSchema: { room, prompt: z.string().min(1).optional(), preset: z.enum(SCENE_PRESETS).optional() }
  },
  async ({ room, prompt, preset }) => {
    const editor = editorFor('view_360')
    const zoneId = zoneIdOf((await editor('state')).layout, room)
    if (preset !== undefined) await editor('setScene', preset)
    const { jobId, image } = succeeded(await editor('view360', { zoneId, prompt }))
    const data = await editor('base64At', image)
    return { content: [...json({ jobId, path: await saveRender(jobId, data) }).content, { type: 'image', data, mimeType: 'image/png' }] }
  }
)

server.registerTool(
  'photo3d',
  { description: 'Turn a finished render (renderJobId) or a local photo (path) into a 3D photo shown in the editor\'s viewer. Waits for the job.', inputSchema: { renderJobId: z.string().min(1).optional(), path: z.string().min(1).optional() } },
  async ({ renderJobId, path }) => {
    if ((renderJobId === undefined) === (path === undefined)) throw new Error('Give exactly one of renderJobId or path.')
    const source = path === undefined ? { kind: 'render' as const, jobId: renderJobId! } : { kind: 'upload' as const, fileName: basename(path), imageBase64: (await readFile(path)).toString('base64') }
    return json({ jobId: succeeded(await editorFor('photo3d')('photo3d', source)).jobId })
  }
)

server.registerTool(
  'set_house_plan',
  {
    description:
      'Replace the house plan (walls, openings, rooms) with a PlanRoom: { kind: "plan", wallHeight, wallThickness, walls: [{ id, from: { x, z }, to }], openings: [{ wallId, kind: "door" | "window", offset, width, height, sill }], zones: [{ id, name, polygon, floor }] }, all in cm. An invalid plan is rejected with its issues and nothing changes. Items whose centre is outside every new room go back to the library and are listed in movedToLibrary. Undoable in the editor.',
    inputSchema: { room: z.record(z.string(), z.unknown()) }
  },
  async ({ room }) => {
    const plan = PlanRoom.safeParse(room)
    if (!plan.success) throw new Error(issuesText(plan.error.issues.map(({ path, message }) => ({ path: path.join('.'), message }))))
    const outcome = await editorFor('set_house_plan')('setHousePlan', plan.data)
    if (!outcome.ok) throw new Error(issuesText(outcome.issues))
    return json({ movedToLibrary: outcome.movedToLibrary })
  }
)

server.registerTool(
  'set_site',
  {
    description:
      'Set the plot of land around the house, in the house\'s coordinates (cm): { lot: [{ x, z }, …] (every wall end must be inside), ground: "grass" | "gravel" | "paving" | "soil", trees?: [{ x, z }], path?: [{ x, z }, …], houseRotationDeg?, northDeg? }. The studio draws it and exterior renders stand on it. Undoable in the editor.',
    inputSchema: { site: z.record(z.string(), z.unknown()) }
  },
  async ({ site }) => {
    const parsed = Site.safeParse(site)
    if (!parsed.success) throw new Error(issuesText(parsed.error.issues.map(({ path, message }) => ({ path: path.join('.'), message }))))
    const outcome = await editorFor('set_site')('setSite', parsed.data)
    if (!outcome.ok) throw new Error(issuesText(outcome.issues))
    return json({ site: parsed.data })
  }
)

server.registerTool(
  'set_blueprint',
  {
    description:
      'Show a floor-plan image (PNG, JPEG or WebP file at path, at most 2 MB) under the plan so mismatches are visible: its pixel (0, 0) sits at (originX, originZ) cm and each pixel is cmPerPixel wide. Saved with the layout.',
    inputSchema: { path: z.string().min(1), cmPerPixel: z.number().positive(), originX: z.number(), originZ: z.number() }
  },
  async ({ path, cmPerPixel, originX, originZ }) => {
    const mime = BLUEPRINT_TYPES[extname(path).toLowerCase()]
    if (!mime) throw new Error(`The blueprint must be a PNG, JPEG or WebP file, not ${basename(path)}.`)
    const image = `data:${mime};base64,${(await readFile(path)).toString('base64')}`
    const outcome = await editorFor('set_blueprint')('setBlueprint', { image, cmPerPixel, origin: { x: originX, z: originZ } })
    if (!outcome.ok) throw new Error(issuesText(outcome.issues))
    return json({ path, cmPerPixel, origin: { x: originX, z: originZ } })
  }
)

server.registerTool(
  'render_exterior',
  {
    description: 'Render the house on its site from outside through ComfyUI: "aerial" (three-quarter view from the south-east) or "street" (eye level in front of the front door). Waits for the job; returns the image and the path of the saved PNG.',
    inputSchema: { view: z.enum(EXTERIOR_VIEWS) }
  },
  async ({ view }) => {
    const editor = editorFor('render_exterior')
    const { jobId, image } = succeeded(await editor('renderExterior', view))
    const data = await editor('base64At', image)
    return { content: [...json({ jobId, path: await saveRender(jobId, data) }).content, { type: 'image', data, mimeType: 'image/png' }] }
  }
)

server.registerTool('screenshot', { description: 'Take a PNG screenshot of the editor\'s current 3D view, to check what the house looks like.' }, async () => {
  const shot = await editorFor('screenshot')('screenshot')
  return { content: [{ type: 'image', data: shot.slice(shot.indexOf(',') + 1), mimeType: 'image/png' }] }
})

server.registerTool('get_jobs', { description: 'List the editor\'s ComfyUI jobs (products, renders, 3D photos) with their steps and results.' }, async () => {
  return json((await editorFor('get_jobs')('state')).jobs)
})

server.registerTool('get_backend', { description: 'Which ComfyUI the editor queues new jobs on (local or cloud, with its URL), whether it is reachable, and which job kinds it cannot run. Switching is left to the user.' }, async () => {
  const { kind, url, status, unavailable } = await editorFor('get_backend')('backend')
  return json({ kind, url, ready: status === 'ready', unavailable: unavailable.map((entry) => entry.kind) })
})

await server.connect(new StdioServerTransport())
