import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const PHOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const LOCAL = 'http://127.0.0.1:8196'
const lastPrompt = async () => (await (await fetch(`${LOCAL}/__last-prompt`)).json()) as Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }>
const render = (page: Page) => page.evaluate(() => window.roomfit.renderInComfy({ prompt: 'house', seed: 1, size: { width: 576, height: 448 } }))
const product = (page: Page) => page.evaluate((imageBase64) => window.roomfit.addProductFromPhoto({ fileName: 'lamp.png', imageBase64, name: 'Lamp', dimensions: { width: 30, depth: 30, height: 150 }, zoneId: 'garage' }), PHOTO)
const QWEN = 'qwen_image_2512_fp8_e4m3fn.safetensors'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  await page.evaluate(() => window.roomfit.setView('studio'))
  await page.evaluate(() => window.roomfit.setBackend({ kind: 'local' }))
})
test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.roomfit.setBackend({ kind: 'cloud' }))
})

test('AC-95 the choice lists built-in workflows with availability, defaults to sets.json, and lists model slots', async ({ page }) => {
  const productChoice = await page.evaluate(() => window.roomfit.workflowChoice('product'))
  expect(productChoice.current).toBe('product-to-glb.json')
  expect(productChoice.options.map((option) => option.id).sort()).toEqual(['cloud/product-to-glb-pixal3d.json', 'product-to-glb.json'])
  expect(productChoice.options.every((option) => option.source === 'builtin' && option.available)).toBe(true)

  const photo = await page.evaluate(() => window.roomfit.workflowChoice('photo3d'))
  const localMoge = photo.options.find((option) => option.id === 'local/photo-to-3d-moge.json')!
  expect(localMoge.available).toBe(false)
  expect(localMoge.missing).toContain('LoadMoGeModel')

  const renderChoice = await page.evaluate(() => window.roomfit.workflowChoice('render'))
  const unet = renderChoice.models.find((slot) => slot.key === '1.unet_name')!
  expect(unet.label).toBe('Load Z-Image Turbo · unet_name')
  expect(unet.value).toBe('z_image_turbo_bf16.safetensors')
  expect(unet.options).toEqual(expect.arrayContaining(['z_image_turbo_bf16.safetensors', QWEN]))
})

test('AC-96 a chosen workflow and model change the next job, and are saved with the layout', async ({ page }) => {
  expect(await page.evaluate(() => window.roomfit.setWorkflow('product', 'cloud/product-to-glb-pixal3d.json'))).toEqual({ ok: true })
  const made = await product(page)
  if (!made.ok) throw new Error(made.message)
  expect(Object.values(await lastPrompt()).some((node) => node.class_type === 'Pixal3DConditioning')).toBe(true)
  expect((await page.evaluate((jobId) => window.roomfit.jobWorkflow(jobId), made.jobId))?.file).toBe('cloud/product-to-glb-pixal3d.json')

  expect(await page.evaluate((value) => window.roomfit.setModel('render', '1.unet_name', value), QWEN)).toEqual({ ok: true })
  const rendered = await render(page)
  if (!rendered.ok) throw new Error(rendered.message)
  expect((await lastPrompt())['1']!.inputs.unet_name).toBe(QWEN)

  expect(await page.evaluate(() => window.roomfit.setWorkflow('render', 'cloud/photo-to-3d-moge.json'))).toEqual({ ok: false, reason: 'wrong-kind' })
  expect(await page.evaluate(() => window.roomfit.setWorkflow('render', 'nope.json'))).toEqual({ ok: false, reason: 'unknown-workflow' })
  expect(await page.evaluate(() => window.roomfit.setModel('render', '99.unet_name', 'x'))).toEqual({ ok: false, reason: 'unknown-slot' })

  const saved = await page.evaluate(() => window.roomfit.save())
  expect(saved.generation).toEqual({ product: { workflow: 'cloud/product-to-glb-pixal3d.json' }, render: { workflow: 'render-from-depth.json', models: { '1.unet_name': QWEN } } })
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  expect((await page.evaluate(() => window.roomfit.workflowChoice('product'))).current).toBe('product-to-glb.json')
  await page.evaluate((layout) => window.roomfit.load(layout), saved)
  expect((await page.evaluate(() => window.roomfit.workflowChoice('product'))).current).toBe('cloud/product-to-glb-pixal3d.json')
})

test('AC-97 a custom workflow with the kind\'s tags becomes an option and runs; one without is refused', async ({ page }) => {
  const graph = JSON.parse(readFileSync('workflows/render-from-depth.json', 'utf8'))
  const sampler = Object.values(graph).find((node: unknown) => (node as { class_type: string }).class_type === 'KSampler') as { inputs: Record<string, unknown> }
  sampler.inputs.steps = 4
  expect(await page.evaluate((value) => window.roomfit.addCustomWorkflow('render', 'fast-render', value), graph)).toEqual({ ok: true, id: 'custom:fast-render' })
  const choice = await page.evaluate(() => window.roomfit.workflowChoice('render'))
  expect(choice.options.find((option) => option.id === 'custom:fast-render')).toMatchObject({ source: 'custom', available: true })
  await page.evaluate(() => window.roomfit.setWorkflow('render', 'custom:fast-render'))
  const rendered = await render(page)
  if (!rendered.ok) throw new Error(rendered.message)
  expect(Object.values(await lastPrompt()).find((node) => node.class_type === 'KSampler')!.inputs.steps).toBe(4)

  const withoutDepth = Object.fromEntries(Object.entries(graph).filter(([, node]) => (node as { _meta?: { title?: string } })._meta?.title !== 'roomfit:depth'))
  const refused = await page.evaluate((value) => window.roomfit.addCustomWorkflow('render', 'broken', value), withoutDepth)
  expect(refused).toMatchObject({ ok: false, missingTags: ['roomfit:depth'] })
})

test('AC-98 the rail\'s Workflows section picks the workflow and the models', async ({ page }) => {
  const rail = page.getByRole('complementary', { name: 'Workspace' })
  await rail.getByText('Workflows', { exact: true }).click()
  await rail.getByRole('combobox', { name: 'Product → 3D workflow' }).selectOption('cloud/product-to-glb-pixal3d.json')
  expect((await page.evaluate(() => window.roomfit.workflowChoice('product'))).current).toBe('cloud/product-to-glb-pixal3d.json')
  await expect(rail.getByRole('combobox', { name: 'Room render workflow' })).toHaveValue('render-from-depth.json')
  await rail.getByRole('combobox', { name: 'Load Z-Image Turbo · unet_name' }).selectOption(QWEN)
  expect((await page.evaluate(() => window.roomfit.workflowChoice('render'))).models.find((slot) => slot.key === '1.unet_name')!.value).toBe(QWEN)
})
