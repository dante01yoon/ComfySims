import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import type { RoomLayout } from '../../packages/schema/src/index.ts'
import type {} from '../../spec/contracts/editor-api.ts'

const house: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const boxRoom: RoomLayout = JSON.parse(readFileSync('fixtures/layouts/living-room.json', 'utf8'))

type Pose = { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }
const distance = (a: Pose, b: Pose) =>
  Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z) +
  Math.hypot(a.target.x - b.target.x, a.target.y - b.target.y, a.target.z - b.target.z)

const settled = (page: Page) => page.waitForFunction(() => !window.roomfit.cameraMoving(), null, { timeout: 5000 })

type Action = { kind: 'focus'; zoneId: string } | { kind: 'chip'; name: string } | { kind: 'view'; view: 'studio' | 'editor' }

async function glide(page: Page, action: Action): Promise<{ poses: Pose[]; seconds: number; resting: Pose }> {
  return page.evaluate(
    (act) =>
      new Promise((resolve) => {
        const poses: Pose[] = []
        const started = performance.now()
        if (act.kind === 'focus') window.roomfit.focusZone(act.zoneId)
        if (act.kind === 'view') window.roomfit.setView(act.view)
        if (act.kind === 'chip') {
          const chips = [...document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Rooms"] button')]
          chips.find((chip) => chip.textContent?.trim() === act.name)?.click()
        }
        const resting = window.roomfit.camera()
        const tick = (now: number) => {
          poses.push(window.roomfit.cameraFrame())
          if (window.roomfit.cameraMoving() && now - started < 4000) requestAnimationFrame(tick)
          else resolve({ poses, seconds: (now - started) / 1000, resting })
        }
        requestAnimationFrame(tick)
      }),
    action
  )
}

const distinct = (poses: Pose[]) => poses.filter((pose, index) => index === 0 || distance(pose, poses[index - 1]!) > 0.5).length

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.roomfit?.ready === 'function')
  await page.evaluate(() => window.roomfit.ready())
  await page.evaluate((layout) => window.roomfit.load(layout), house)
  await page.evaluate(() => window.roomfit.setView('studio'))
  await settled(page)
})

test('AC-116 focusing a room glides there and camera() is the destination at once', async ({ page }) => {
  const { poses, seconds, resting } = await glide(page, { kind: 'focus', zoneId: 'bedroom' })
  expect(distinct(poses)).toBeGreaterThanOrEqual(5)
  expect(seconds).toBeGreaterThanOrEqual(0.5)
  expect(seconds).toBeLessThanOrEqual(1.5)
  expect(distance(poses.at(-1)!, resting)).toBeLessThan(1)
  expect(distance(resting, await page.evaluate(() => window.roomfit.camera()))).toBeLessThan(0.01)
})

test('AC-116 room chips and switching views glide too', async ({ page }) => {
  const chip = await glide(page, { kind: 'chip', name: 'Office' })
  expect(distinct(chip.poses)).toBeGreaterThanOrEqual(5)
  await settled(page)
  await page.evaluate(() => window.roomfit.setView('editor'))
  await settled(page)
  const view = await glide(page, { kind: 'view', view: 'studio' })
  expect(distinct(view.poses)).toBeGreaterThanOrEqual(5)
  expect(distance(view.poses.at(-1)!, view.resting)).toBeLessThan(1)
})

test('AC-116 setCamera stays instant', async ({ page }) => {
  const pose = { position: { x: 300, y: 500, z: 900 }, target: { x: 0, y: 0, z: 0 } }
  const after = await page.evaluate((value) => {
    window.roomfit.setCamera(value)
    return { frame: window.roomfit.cameraFrame(), moving: window.roomfit.cameraMoving() }
  }, pose)
  expect(after.moving).toBe(false)
  expect(distance(after.frame, pose)).toBeLessThan(0.01)
})

test('AC-117 exporting mid-transition uses the destination, and screenshot waits for the camera to settle', async ({ page }) => {
  const midFlight = await page.evaluate(async () => {
    window.roomfit.focusZone('office')
    const passes = await window.roomfit.exportPasses({ width: 96, height: 64 })
    return { depth: passes.depth, frame: window.roomfit.cameraFrame(), resting: window.roomfit.camera() }
  })
  expect(distance(midFlight.frame, midFlight.resting)).toBeLessThan(1)
  await settled(page)
  const calm = await page.evaluate(async () => (await window.roomfit.exportPasses({ width: 96, height: 64 })).depth)
  expect(midFlight.depth).toBe(calm)

  const shot = await page.evaluate(async () => {
    window.roomfit.focusZone('bath')
    await window.roomfit.screenshot()
    return { moving: window.roomfit.cameraMoving(), frame: window.roomfit.cameraFrame(), resting: window.roomfit.camera() }
  })
  expect(shot.moving).toBe(false)
  expect(distance(shot.frame, shot.resting)).toBeLessThan(1)
})

test('AC-118 orbiting has inertia and comes to rest', async ({ page }) => {
  const box = (await page.locator('canvas').first().boundingBox())!
  const empty = { x: box.x + 100, y: box.y + 50 }
  await page.mouse.move(empty.x, empty.y)
  await page.mouse.down()
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(empty.x + step * 30, empty.y, { steps: 2 })
  await page.mouse.up()
  const motion = await page.evaluate(
    () =>
      new Promise<{ moved: number; settleSeconds: number }>((resolve) => {
        const released = performance.now()
        const atRelease = window.roomfit.cameraFrame()
        setTimeout(() => {
          const later = window.roomfit.cameraFrame()
          const moved = Math.hypot(later.position.x - atRelease.position.x, later.position.y - atRelease.position.y, later.position.z - atRelease.position.z)
          const wait = () => (window.roomfit.cameraMoving() && performance.now() - released < 4000 ? requestAnimationFrame(wait) : resolve({ moved, settleSeconds: (performance.now() - released) / 1000 }))
          wait()
        }, 120)
      })
  )
  expect(await page.evaluate(() => window.roomfit.state().selectedId)).toBeNull()
  expect(motion.moved).toBeGreaterThan(0.5)
  expect(motion.settleSeconds).toBeLessThanOrEqual(1.5)
})

test('AC-119 walk mode needs a focused room and enters at eye height with a glide', async ({ page }) => {
  const walkButton = page.getByRole('button', { name: 'Walk', exact: true })
  await expect(walkButton).toBeDisabled()
  expect(await page.evaluate(() => window.roomfit.walk())).toEqual({ ok: false, reason: 'no-room' })

  await page.evaluate(() => window.roomfit.focusZone('living'))
  await settled(page)
  await expect(walkButton).toBeEnabled()
  await walkButton.click()
  expect(await page.evaluate(() => window.roomfit.cameraMoving())).toBe(true)
  const navigation = await page.evaluate(() => window.roomfit.state().navigation)
  if (navigation.mode !== 'walk') throw new Error('expected walk mode')
  expect(navigation.eye.y).toBe(160)
  expect(navigation.pitchDeg).toBe(0)
  expect(navigation.zoneId).toBe('living')
  expect(navigation.eye.x).toBeGreaterThan(-700)
  expect(navigation.eye.x).toBeLessThan(0)
  expect(navigation.eye.z).toBeGreaterThan(0)
  expect(navigation.eye.z).toBeLessThan(500)
  expect((await page.evaluate(() => window.roomfit.camera())).position.y).toBe(160)
  await settled(page)
  expect((await page.evaluate(() => window.roomfit.cameraFrame())).position.y).toBeCloseTo(160, 0)
  await expect(page.getByRole('button', { name: 'Exit walk' })).toBeVisible()

  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => window.roomfit.state().navigation)).toEqual({ mode: 'orbit' })
  expect(await page.evaluate(() => window.roomfit.state().focusedZone)).toBe('living')
  expect(await page.evaluate(() => window.roomfit.cameraMoving())).toBe(true)
})

test('AC-119 walk refuses a box room and a start inside a wall', async ({ page }) => {
  expect(await page.evaluate(() => window.roomfit.walk({ x: -150, z: 5 }))).toEqual({ ok: false, reason: 'blocked' })
  await page.evaluate((layout) => window.roomfit.load(layout), boxRoom)
  expect(await page.evaluate(() => window.roomfit.walk({ x: 0, z: 0 }))).toEqual({ ok: false, reason: 'not-a-plan' })
})

const eye = (page: Page) =>
  page.evaluate(() => {
    const navigation = window.roomfit.state().navigation
    if (navigation.mode !== 'walk') throw new Error('not walking')
    return navigation
  })

test('AC-120 a wall stops the walker at its face', async ({ page }) => {
  expect(await page.evaluate(() => window.roomfit.walk({ x: -150, z: 100, yawDeg: 90 }))).toEqual({ ok: true })
  const step = await page.evaluate(() => window.roomfit.walkStep({ forward: 400, right: 0 }))
  expect(step.blocked).toBe(true)
  const { eye: position } = await eye(page)
  expect(position.x).toBeLessThanOrEqual(-32)
  expect(position.x).toBeGreaterThan(-45)
})

test('AC-120 a door lets the walker into the next room, and the focused room follows', async ({ page }) => {
  await page.evaluate(() => window.roomfit.walk({ x: -150, z: 260, yawDeg: 90 }))
  const step = await page.evaluate(() => window.roomfit.walkStep({ forward: 200, right: 0 }))
  expect(step.blocked).toBe(false)
  expect(step.moved).toBeCloseTo(200, 0)
  const navigation = await eye(page)
  expect(navigation.eye.x).toBeCloseTo(50, 0)
  expect(navigation.zoneId).toBe('kitchen')
  expect(await page.evaluate(() => window.roomfit.state().focusedZone)).toBe('kitchen')
})

test('AC-120 tall furniture stops the walker, low furniture does not', async ({ page }) => {
  await page.evaluate(() => window.roomfit.walk({ x: -350, z: 200, yawDeg: 0 }))
  const step = await page.evaluate(() => window.roomfit.walkStep({ forward: 300, right: 0 }))
  expect(step.blocked).toBe(true)
  const { eye: position } = await eye(page)
  expect(position.z).toBeGreaterThan(330)
  expect(position.z).toBeLessThanOrEqual(350.5)
})

test('AC-120 holding W walks forward at walking speed', async ({ page }) => {
  await page.evaluate(() => window.roomfit.walk({ x: -500, z: 150, yawDeg: 0 }))
  await settled(page)
  const start = (await eye(page)).eye
  await page.locator('canvas').first().focus()
  await page.keyboard.down('w')
  await page.waitForTimeout(1000)
  await page.keyboard.up('w')
  await settled(page)
  const end = (await eye(page)).eye
  const walked = Math.hypot(end.x - start.x, end.z - start.z)
  expect(walked).toBeGreaterThanOrEqual(100)
  expect(walked).toBeLessThanOrEqual(180)
  expect(end.z).toBeGreaterThan(start.z)
})

test('AC-121 look turns relative to the view and clamps pitch', async ({ page }) => {
  await page.evaluate(() => window.roomfit.walk({ x: -350, z: 150, yawDeg: 90 }))
  await page.evaluate(() => window.roomfit.look({ yawDeg: 300, pitchDeg: 20 }))
  let navigation = await eye(page)
  expect(navigation.yawDeg).toBeCloseTo(30, 6)
  expect(navigation.pitchDeg).toBeCloseTo(20, 6)
  await page.evaluate(() => window.roomfit.look({ yawDeg: 0, pitchDeg: 200 }))
  expect((await eye(page)).pitchDeg).toBe(60)
  await page.evaluate(() => window.roomfit.look({ yawDeg: 0, pitchDeg: -500 }))
  expect((await eye(page)).pitchDeg).toBe(-60)

  await page.evaluate(() => window.roomfit.look({ yawDeg: 0, pitchDeg: 60 }))
  await settled(page)
  const box = (await page.locator('canvas').first().boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 400, { steps: 8 })
  await page.mouse.up()
  navigation = await eye(page)
  expect(navigation.yawDeg).not.toBeCloseTo(30, 0)
  expect(Math.abs(navigation.pitchDeg)).toBeLessThanOrEqual(60)
})

test('AC-122 nothing renders while idle, and an edit renders a frame', async ({ page }) => {
  await page.waitForTimeout(1500)
  const before = await page.evaluate(() => window.roomfit.renderStats().frames)
  await page.waitForTimeout(2000)
  expect(await page.evaluate(() => window.roomfit.renderStats().frames)).toBe(before)
  await page.evaluate(() => window.roomfit.moveItem('item-armchair', { x: -600, z: 250 }))
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.roomfit.renderStats().frames)).toBeGreaterThan(before)
})
