import { existsSync, readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { expect, test } from '@playwright/test'
import WebSocket from 'ws'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const zoneOf = (id: string) => (house.room.kind === 'plan' ? house.room.zones.find((zone) => zone.id === id)! : null)!
const inside = (id: string, p: { x: number; z: number }) => {
  const xs = zoneOf(id).polygon.map((v) => v.x)
  const zs = zoneOf(id).polygon.map((v) => v.z)
  return p.x >= Math.min(...xs) && p.x <= Math.max(...xs) && p.z >= Math.min(...zs) && p.z <= Math.max(...zs)
}

let client: Client
type Content = { type: string; text?: string; data?: string; mimeType?: string }
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 })
  return { isError: result.isError === true, content: result.content as Content[] }
}
const json = (content: Content[]) => JSON.parse(content.find((part) => part.type === 'text')!.text!)

test.beforeAll(async () => {
  client = new Client({ name: 'roomfit-e2e', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: 'pnpm', args: ['-s', 'mcp'], env: { ...process.env, ROOMFIT_URL: 'http://127.0.0.1:5179' } as Record<string, string> }))
})
test.afterAll(() => client?.close())

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  await page.evaluate(() => window.roomfit.setView('studio'))
})

test('AC-57 get_house describes the open editor', async ({ page }) => {
  const result = await call('get_house')
  expect(result.isError).toBe(false)
  const reported = json(result.content)
  const state = await page.evaluate(() => window.roomfit.state())

  expect(reported.rooms.map((room: { id: string }) => room.id).sort()).toEqual(['bath', 'bedroom', 'garage', 'kitchen', 'living', 'office'])
  expect(reported.rooms.find((room: { id: string }) => room.id === 'bedroom').itemCount).toBe(3)
  expect(reported.items).toHaveLength(state.layout.items.length)
  expect(reported.problems).toEqual({ collisions: [], outOfBounds: [] })
  await expect(page.getByText('Agent connected')).toBeVisible()
})

test('AC-57 tools change the open editor, address rooms by name, and label their undo steps', async ({ page }) => {
  const placed = await call('place_asset', { assetId: 'asset-armchair', room: 'Bedroom' })
  expect(placed.isError).toBe(false)
  const { itemId } = json(placed.content)
  let state = await page.evaluate(() => window.roomfit.state())
  expect(inside('bedroom', state.layout.items.find((item) => item.id === itemId)!.position)).toBe(true)
  expect(state.undoLabels.at(-1)).toBe('mcp:place_asset')

  expect((await call('rename_room', { room: 'office', name: 'Studio' })).isError).toBe(false)
  expect((await call('focus_room', { room: 'garage' })).isError).toBe(false)
  state = await page.evaluate(() => window.roomfit.state())
  expect(state.layout.room.kind === 'plan' && state.layout.room.zones.find((zone) => zone.id === 'office')!.name).toBe('Studio')
  expect(state.focusedZone).toBe('garage')
  expect(state.undoLabels.slice(-2)).toEqual(['mcp:place_asset', 'mcp:rename_room'])

  await page.evaluate(() => { window.roomfit.undo(); window.roomfit.undo() })
  state = await page.evaluate(() => window.roomfit.state())
  expect(state.layout.items.some((item) => item.id === itemId)).toBe(false)
})

test('AC-58 add_product with a Comfy input name queues that image without uploading', async ({ page }) => {
  const before = (await (await fetch('http://127.0.0.1:8199/__requests')).json()) as { method: string; url: string }[]
  const uploadsBefore = before.filter((request) => request.method === 'POST' && request.url === '/api/upload/image').length

  const result = await call('add_product', { image: { comfyInputName: 'existing-input.png' }, name: 'Lamp', width: 30, depth: 30, height: 150, room: 'garage' })
  expect(result.isError).toBe(false)
  const { itemId } = json(result.content)

  const after = (await (await fetch('http://127.0.0.1:8199/__requests')).json()) as { method: string; url: string }[]
  expect(after.filter((request) => request.method === 'POST' && request.url === '/api/upload/image')).toHaveLength(uploadsBefore)
  const prompts = (await (await fetch('http://127.0.0.1:8199/__prompts')).json()) as { images: string[] }[]
  expect(prompts.at(-1)!.images).toContain('existing-input.png')
  const state = await page.evaluate(() => window.roomfit.state())
  expect(inside('garage', state.layout.items.find((item) => item.id === itemId)!.position)).toBe(true)
})

test('AC-59 screenshot and render_room return PNG images, and render_room saves the file', async () => {
  const shot = await call('screenshot')
  const image = shot.content.find((part) => part.type === 'image')!
  expect(image.mimeType).toBe('image/png')
  expect(image.data!.startsWith('iVBOR')).toBe(true)

  const render = await call('render_room', { room: 'living', prompt: 'warm living room' })
  expect(render.isError).toBe(false)
  expect(render.content.find((part) => part.type === 'image')?.mimeType).toBe('image/png')
  const { path } = json(render.content)
  expect(existsSync(path)).toBe(true)
})

test('AC-67 view_360 returns the panorama as PNG image content and saves the file', async ({ page }) => {
  const result = await call('view_360', { room: 'Bedroom', prompt: 'equirectangular 360 image, cozy bedroom' })
  expect(result.isError).toBe(false)
  expect(result.content.find((part) => part.type === 'image')?.mimeType).toBe('image/png')
  const { jobId, path } = json(result.content)
  expect(existsSync(path)).toBe(true)
  const state = await page.evaluate(() => window.roomfit.state())
  expect(state.jobs.find((job) => job.id === jobId)?.kind).toBe('pano360')
  expect(state.undoLabels.filter((label) => label === 'mcp:view_360')).toHaveLength(0)
})

test('AC-74 get_backend reports the backend the editor uses and what it cannot run', async () => {
  await expect.poll(async () => json((await call('get_backend')).content), { timeout: 15_000 }).toEqual({ kind: 'cloud', url: 'http://127.0.0.1:8199', ready: true, unavailable: [] })
})

test('AC-81 add_product keeps product fields, set_asset_labels relabels undoably, list_assets returns both', async ({ page }) => {
  const added = await call('add_product', { image: { comfyInputName: 'existing-input.png' }, name: 'Store lamp', width: 30, depth: 30, height: 150, room: 'garage', productUrl: 'https://www.example-store.com/lamp-42', brand: 'Lumen', store: 'Example Store', labels: ['lighting'] })
  expect(added.isError).toBe(false)
  const { itemId } = json(added.content)
  const assetId = (await page.evaluate(() => window.roomfit.state())).layout.items.find((item) => item.id === itemId)!.assetId

  const relabelled = await call('set_asset_labels', { assetId, labels: ['lighting', 'shortlist'] })
  expect(relabelled.isError).toBe(false)
  const state = await page.evaluate(() => window.roomfit.state())
  expect(state.undoLabels.at(-1)).toBe('mcp:set_asset_labels')

  const listed = json((await call('list_assets')).content) as { id: string; product?: Record<string, unknown>; labels?: string[] }[]
  expect(listed.find((asset) => asset.id === assetId)).toMatchObject({ product: { url: 'https://www.example-store.com/lamp-42', brand: 'Lumen', store: 'Example Store' }, labels: ['lighting', 'shortlist'] })
  expect((await call('set_asset_labels', { assetId: 'nope', labels: [] })).isError).toBe(true)
})

test('AC-92 add_product with place false adds to the library only and returns the asset id', async ({ page }) => {
  const before = (await page.evaluate(() => window.roomfit.state())).layout.items.length
  const added = await call('add_product', { image: { comfyInputName: 'existing-input.png' }, name: 'Spare stool', width: 40, depth: 40, height: 45, place: false })
  expect(added.isError).toBe(false)
  const { itemId, assetId } = json(added.content)
  expect(itemId).toBeNull()
  const state = await page.evaluate(() => window.roomfit.state())
  expect(state.layout.items).toHaveLength(before)
  expect(state.layout.assets.some((asset) => asset.id === assetId)).toBe(true)
})

test('AC-60 the bridge refuses a wrong token and foreign origins', async () => {
  const closeCode = (url: string, headers: Record<string, string> = {}) => new Promise<number>((resolve) => {
    const socket = new WebSocket(url, { headers })
    socket.on('close', (code) => resolve(code))
    socket.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0))
    socket.on('error', () => {})
  })
  const token = readFileSync('.harness/bridge-token', 'utf8').trim()

  expect(await closeCode('ws://127.0.0.1:5179/__roomfit-bridge?role=agent&token=wrong')).toBe(4401)
  expect(await closeCode(`ws://127.0.0.1:5179/__roomfit-bridge?role=agent&token=${token}`, { Origin: 'http://evil.example' })).toBe(4403)
})

test('AC-60 with the editor closed, tools say no editor is connected', async ({ page }) => {
  await page.close()
  await new Promise((resolve) => setTimeout(resolve, 500))
  const result = await call('get_house')
  expect(result.isError).toBe(true)
  expect(result.content[0]!.text).toMatch(/^No roomfit editor is connected/)
})
