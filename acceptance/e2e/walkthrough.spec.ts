import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const CLOUD = 'http://127.0.0.1:8199'
const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const jobs = (page: Page) => page.getByRole('region', { name: 'Jobs' })
const card = (page: Page, title: string) => jobs(page).getByRole('article', { name: title })
const viewer = (page: Page) => page.getByRole('dialog', { name: 'Walkthrough' })
type QueuedPrompt = { id: string; images: string[]; videos: string[]; savePrefix: string | null; positive: string | null }
const prompts = async () => (await (await fetch(`${CLOUD}/__prompts`)).json()) as QueuedPrompt[]
const uploaded = async (name: string) => Buffer.from(await (await fetch(`${CLOUD}/__uploads/${name}`)).arrayBuffer())

async function open(page: Page, layout: RoomLayout) {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((value) => window.roomfit.load(value), layout)
  await page.evaluate(() => window.roomfit.setView('studio'))
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

async function videoTrack(bytes: Buffer) {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS })
  const track = await input.getPrimaryVideoTrack()
  if (!track) throw new Error('no video track')
  return { mimeType: await input.getMimeType(), codec: track.codec, width: track.displayWidth, height: track.displayHeight, ...(await track.computePacketStats()) }
}

async function meanGreyDifference(page: Page, video: Buffer, image: Buffer) {
  return page.evaluate(async ({ video, image }) => {
    const bytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const element = document.createElement('video')
    element.muted = true
    element.src = URL.createObjectURL(new Blob([bytes(video)], { type: 'video/webm' }))
    await new Promise((resolve, reject) => { element.onloadeddata = resolve; element.onerror = reject })
    element.currentTime = 0
    await new Promise((resolve) => { element.onseeked = resolve })
    const still = await createImageBitmap(new Blob([bytes(image)], { type: 'image/png' }))
    const grey = (source: CanvasImageSource) => {
      const canvas = new OffscreenCanvas(still.width, still.height)
      const context = canvas.getContext('2d')!
      context.drawImage(source, 0, 0, still.width, still.height)
      const data = context.getImageData(0, 0, still.width, still.height).data
      return Array.from({ length: data.length / 4 }, (_, pixel) => data[pixel * 4]!)
    }
    const a = grey(element)
    const b = grey(still)
    return a.reduce((sum, value, index) => sum + Math.abs(value - b[index]!), 0) / a.length
  }, { video: video.toString('base64'), image: image.toString('base64') })
}

async function walkthroughJob(page: Page) {
  test.setTimeout(240_000)
  await page.evaluate(() => window.roomfit.focusZone('living'))
  await page.getByRole('button', { name: 'Walkthrough video' }).click()
  await expect(card(page, 'Walkthrough · Living')).toContainText('done', { timeout: 180_000 })
  const queued = await prompts()
  const walkthrough = [...queued].reverse().find((prompt) => prompt.savePrefix === 'roomfit/walkthrough')!
  const firstFrame = queued.slice(0, queued.indexOf(walkthrough)).reverse().find((prompt) => prompt.savePrefix === 'roomfit/render')!
  return { walkthrough, firstFrame }
}

test.describe('AC-136 the room path', () => {
  test('AC-136 the living-room path starts at the eye-level shot and every eye can stand in the room', async ({ page }) => {
    await open(page, house)
    await page.evaluate(() => window.roomfit.focusZone('living'))
    const render = await page.evaluate(() => window.roomfit.renderInComfy({ prompt: 'living room', seed: 1 }))
    if (!render.ok) throw new Error(render.message)
    const shot = (await page.evaluate(() => window.roomfit.state().lastRenderCamera))!
    await page.keyboard.press('Escape')

    const path = await page.evaluate(() => window.roomfit.walkthroughPath('living'))
    if (!('poses' in path)) throw new Error('no path')
    expect(path.poses).toHaveLength(121)
    expect(path.dollyCm).toBeGreaterThanOrEqual(40)
    expect(path.dollyCm).toBeLessThanOrEqual(160)
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(path.poses[0]!.position[axis]).toBeCloseTo(shot.position[axis], 3)
      expect(path.poses[0]!.target[axis]).toBeCloseTo(shot.target[axis], 3)
    }
    for (const pose of path.poses.filter((_, index) => index % 10 === 0 || index === 120)) {
      const walked = await page.evaluate(({ x, z }) => window.roomfit.walk({ x, z }), { x: pose.position.x, z: pose.position.z })
      expect(walked, `eye at ${Math.round(pose.position.x)}, ${Math.round(pose.position.z)}`).toEqual({ ok: true })
      const navigation = await page.evaluate(() => window.roomfit.state().navigation)
      expect(navigation.mode === 'walk' && navigation.zoneId).toBe('living')
      await page.evaluate(() => window.roomfit.stopWalking())
    }
    expect(await page.evaluate(() => window.roomfit.walkthroughPath('nowhere'))).toEqual({ ok: false, reason: 'unknown-zone' })
  })
})

test.describe('AC-137 the depth video', () => {
  test('AC-137 VP9 WebM, 121 frames at 25 fps, 1280 × 704', async ({ page }) => {
    await open(page, house)
    const depth = await page.evaluate(() => window.roomfit.walkthroughDepthVideo('living'))
    if (!('video' in depth)) throw new Error('no depth video')
    expect(depth).toMatchObject({ frames: 121, width: 1280, height: 704, fps: 25 })
    const bytes = Buffer.from(await page.evaluate(async (url) => { const b = new Uint8Array(await (await fetch(url)).arrayBuffer()); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s) }, depth.video), 'base64')

    expect(await videoTrack(bytes)).toMatchObject({ codec: 'vp9', width: 1280, height: 704, packetCount: 121, averagePacketRate: 25 })
    expect(await page.evaluate(() => window.roomfit.walkthroughDepthVideo('nowhere'))).toEqual({ ok: false, reason: 'unknown-zone' })
  })

  test('AC-137 the uploaded depth video opens on the same depth the first frame was rendered from', async ({ page }) => {
    await open(page, house)
    const { walkthrough, firstFrame } = await walkthroughJob(page)
    const video = await uploaded(walkthrough.videos[0]!)
    const depthStill = await uploaded(firstFrame.images[0]!)

    expect((await videoTrack(video)).codec).toBe('vp9')
    expect(await meanGreyDifference(page, video, depthStill)).toBeLessThan(6)
  })
})

test('AC-138 "Walkthrough video" needs a focused room, renders the first frame, then queues the walkthrough workflow with it and the depth video', async ({ page }) => {
  await open(page, house)
  const button = page.getByRole('button', { name: 'Walkthrough video' })
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute('title', 'Focus a room first')
  expect(await page.evaluate(() => window.roomfit.walkthrough())).toEqual({ ok: false, reason: 'no-room' })

  const { walkthrough, firstFrame } = await walkthroughJob(page)
  expect(firstFrame.images).toHaveLength(1)
  expect(walkthrough.images).toHaveLength(1)
  expect(walkthrough.images[0]).not.toBe(firstFrame.images[0])
  expect(walkthrough.videos).toHaveLength(1)
  expect(walkthrough.videos[0]).toMatch(/\.webm$/)
  expect(walkthrough.positive).toMatch(/^A slow, steady camera walkthrough of /)
  expect(walkthrough.positive).toContain('Living')
  expect(walkthrough.positive).toMatch(/The room stays still; no people\.$/)

  const job = (await page.evaluate(() => window.roomfit.state().jobs)).find((entry) => entry.kind === 'walkthrough')!
  const order = ['path', 'first-frame', 'uploading', 'queued', 'generating', 'downloading', 'done']
  const seen = job.steps.map(({ status }) => status).filter((status, index, all) => order.includes(status) && all.indexOf(status) === index)
  expect(seen).toEqual(order)
})

test('AC-139 the viewer plays the clip, downloads it and closes', async ({ page }) => {
  await open(page, house)
  await page.evaluate(() => window.roomfit.focusZone('living'))
  const outcome = await page.evaluate(() => window.roomfit.walkthrough())
  if (!outcome.ok) throw new Error('walkthrough failed')
  await expect(viewer(page)).toBeVisible()
  const clip = viewer(page).locator('video')
  await expect(clip).toHaveJSProperty('muted', true)
  await expect(clip).toHaveJSProperty('loop', true)
  await expect.poll(() => clip.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 10_000 }).toBeGreaterThan(0)

  const download = page.waitForEvent('download')
  await viewer(page).getByRole('button', { name: 'Download' }).click()
  expect((await download).suggestedFilename()).toBe('comfysims-walkthrough-living.webm')

  await viewer(page).getByRole('button', { name: 'Close' }).click()
  expect(await page.evaluate(() => window.roomfit.state().walkthroughViewer)).toBeNull()
  await page.evaluate((jobId) => window.roomfit.openWalkthrough(jobId), outcome.jobId)
  await expect(viewer(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer(page)).toBeHidden()
  expect(await page.evaluate(() => window.roomfit.state().walkthroughViewer)).toBeNull()
})

test('AC-140 moving furniture in the room marks its clip stale; only Regenerate makes a new one', async ({ page }) => {
  await open(page, house)
  const outcome = await page.evaluate(() => window.roomfit.walkthrough({ zoneId: 'living' }))
  if (!outcome.ok) throw new Error('walkthrough failed')
  await page.evaluate(() => window.roomfit.closeWalkthrough())

  await page.evaluate(() => window.roomfit.moveItem('item-bed', { x: -450, z: -300 }))
  await expect(card(page, 'Walkthrough · Living')).not.toContainText('Layout changed since this video')

  await page.evaluate(() => window.roomfit.moveItem('item-armchair', { x: -600, z: 200 }))
  await expect(card(page, 'Walkthrough · Living')).toContainText('Layout changed since this video')
  await page.evaluate((jobId) => window.roomfit.openWalkthrough(jobId), outcome.jobId)
  expect((await page.evaluate(() => window.roomfit.state().walkthroughViewer))?.stale).toBe(true)
  await expect(viewer(page)).toContainText('Layout changed since this video')
  await page.evaluate(() => window.roomfit.closeWalkthrough())

  await page.waitForTimeout(500)
  expect((await page.evaluate(() => window.roomfit.state().jobs)).filter((job) => job.kind === 'walkthrough')).toHaveLength(1)
  await card(page, 'Walkthrough · Living').getByRole('button', { name: 'Regenerate' }).click()
  await expect(jobs(page).getByRole('article', { name: 'Walkthrough · Living' })).toHaveCount(2)
})
