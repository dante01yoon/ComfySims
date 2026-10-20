import type { OrbitControls } from '@react-three/drei'
import type { RootState } from '@react-three/fiber'
import type { ComponentRef } from 'react'

import type { Vec3 } from '../../spec/contracts/editor-api.ts'

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>
export type CameraPose = { position: Vec3; target: Vec3 }
type Glide = { from: CameraPose; to: CameraPose; startedAt: number; seconds: number }

const GLIDE_SECONDS = { shortest: 0.6, longest: 1.0 }
const GLIDE_LONGEST_AT_CM = 1500
const GLIDE_SKIPPED_BELOW_CM = 0.5
const ORBIT_DAMPING_SECONDS = 0.1
const ORBIT_SETTLED_STEP_CM = 0.05
const ORBIT_STILL_STEP_CM = 0.001
const ZOOM_SECONDS = 0.12
const ZOOM_PER_WHEEL_PIXEL = 1.0015
const ZOOM_DISTANCE_CM = { min: 100, max: 12000 }
const ZOOM_SETTLED_CM = 0.05
const IDLE_FRAME_GAP_MS = 250
const STEADY_FRAME_SECONDS = 1 / 60

let getThree: (() => RootState) | null = null
let controls: OrbitControlsImpl | null = null
let glide: Glide | null = null
let zoomGoalCm: number | null = null
let walking = false
let itemDragging = false
let orbitDragging = false
let orbitMoving = false
let lastFrameAt = 0
let positionBeforeControls: Vec3 = { x: 0, y: 0, z: 0 }
let frames = 0

const startOrbitDrag = () => {
  orbitDragging = true
}
const endOrbitDrag = () => {
  orbitDragging = false
  invalidate()
}

export function attachCameraThree(get: () => RootState): void {
  getThree = get
}

export function attachControls(instance: OrbitControlsImpl | null): void {
  controls?.removeEventListener('start', startOrbitDrag)
  controls?.removeEventListener('end', endOrbitDrag)
  controls = instance
  controls?.addEventListener('start', startOrbitDrag)
  controls?.addEventListener('end', endOrbitDrag)
  syncControls()
}

/** Requests a frame from the on-demand canvas. */
export function invalidate(): void {
  getThree?.().invalidate()
}

function syncControls(): void {
  if (controls) controls.enabled = glide === null && !walking && !itemDragging
}

/** Hands the camera to walk mode (controls off) or back to orbiting. */
export function setWalking(value: boolean): void {
  walking = value
  syncControls()
}

/** Keeps the orbit controls off while an item is dragged on the floor. */
export function holdForItemDrag(held: boolean): void {
  itemDragging = held
  syncControls()
}

function distanceCm(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function poseDistanceCm(a: CameraPose, b: CameraPose): number {
  return distanceCm(a.position, b.position) + distanceCm(a.target, b.target)
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }
}

function glideSeconds(from: CameraPose, to: CameraPose): number {
  const share = Math.min(1, poseDistanceCm(from, to) / GLIDE_LONGEST_AT_CM)
  return GLIDE_SECONDS.shortest + (GLIDE_SECONDS.longest - GLIDE_SECONDS.shortest) * share
}

function copy({ x, y, z }: Vec3): Vec3 {
  return { x, y, z }
}

/** The pose rendered right now. */
export function cameraFrame(): CameraPose {
  const position = getThree?.().camera.position ?? { x: 0, y: 0, z: 0 }
  return { position: copy(position), target: copy(controls?.target ?? { x: 0, y: 0, z: 0 }) }
}

/** Where the orbit camera comes to rest: the end of a running glide, else the pose on screen. */
export function restingPose(): CameraPose {
  return glide ? { position: copy(glide.to.position), target: copy(glide.to.target) } : cameraFrame()
}

function applyPose({ position, target }: CameraPose): void {
  if (!getThree) return
  const { camera } = getThree()
  camera.position.set(position.x, position.y, position.z)
  controls?.target.set(target.x, target.y, target.z)
  camera.lookAt(target.x, target.y, target.z)
}

function flushOrbitInertia(): void {
  if (!controls) return
  controls.enableDamping = false
  controls.update()
  controls.enableDamping = true
}

function settle(): void {
  syncControls()
  if (!walking) controls?.update()
  invalidate()
}

/** Puts the camera at a pose at once, cancelling any glide, inertia or zoom. */
export function jumpTo(pose: CameraPose): void {
  glide = null
  zoomGoalCm = null
  flushOrbitInertia()
  applyPose(pose)
  settle()
}

/** Moves the camera from where it is on screen to a pose with an ease-in-out glide. */
export function glideTo(to: CameraPose): void {
  const from = cameraFrame()
  if (poseDistanceCm(from, to) < GLIDE_SKIPPED_BELOW_CM) return jumpTo(to)
  zoomGoalCm = null
  flushOrbitInertia()
  glide = { from, to, startedAt: performance.now(), seconds: glideSeconds(from, to) }
  syncControls()
  invalidate()
}

/** Changes where the camera is going: the end of a running glide, else the pose on screen. */
export function retarget(to: CameraPose): void {
  if (glide) glide.to = to
  else applyPose(to)
  invalidate()
}

/** Ends a running glide at its destination. */
export function finishGlide(): void {
  if (!glide) return
  applyPose(glide.to)
  glide = null
  settle()
}

/** Zooms the orbit camera toward or away from its target, smoothly; positive wheel pixels move away. */
export function zoomBy(wheelPixels: number): void {
  if (glide || walking || !getThree) return
  const { camera } = getThree()
  const current = zoomGoalCm ?? distanceCm(camera.position, controls?.target ?? { x: 0, y: 0, z: 0 })
  zoomGoalCm = Math.min(ZOOM_DISTANCE_CM.max, Math.max(ZOOM_DISTANCE_CM.min, current * ZOOM_PER_WHEEL_PIXEL ** wheelPixels))
  invalidate()
}

function zoomStep(goal: number, seconds: number): void {
  if (!getThree || !controls) return
  const { camera } = getThree()
  const offset = camera.position.clone().sub(controls.target)
  const distance = offset.length()
  const next = distance + (goal - distance) * (1 - Math.exp(-seconds / ZOOM_SECONDS))
  const arrived = Math.abs(goal - next) < ZOOM_SETTLED_CM
  camera.position.copy(controls.target).addScaledVector(offset, (arrived ? goal : next) / distance)
  if (arrived) zoomGoalCm = null
}

function frameSeconds(now: number): number {
  const gap = now - lastFrameAt
  lastFrameAt = now
  return gap > IDLE_FRAME_GAP_MS ? STEADY_FRAME_SECONDS : gap / 1000
}

/** Runs before the orbit controls each frame: glide, smooth zoom and frame-rate independent damping. */
export function advanceCamera(now: number): void {
  frames += 1
  const seconds = frameSeconds(now)
  if (controls) controls.dampingFactor = 1 - Math.exp(-seconds / ORBIT_DAMPING_SECONDS)
  if (glide) {
    const progress = (now - glide.startedAt) / (glide.seconds * 1000)
    if (progress >= 1) finishGlide()
    else applyPose({ position: mix(glide.from.position, glide.to.position, easeInOut(progress)), target: mix(glide.from.target, glide.to.target, easeInOut(progress)) })
  }
  if (zoomGoalCm !== null) zoomStep(zoomGoalCm, seconds)
  if (glide || zoomGoalCm !== null) invalidate()
  positionBeforeControls = copy(getThree?.().camera.position ?? positionBeforeControls)
}

/** Runs after the orbit controls each frame: notices inertia and stops it once it has slowed to a crawl. */
export function settleOrbit(): void {
  if (!getThree || !controls?.enabled) {
    orbitMoving = false
    return
  }
  const step = distanceCm(getThree().camera.position, positionBeforeControls)
  orbitMoving = step > ORBIT_STILL_STEP_CM
  if (orbitMoving && !orbitDragging && zoomGoalCm === null && step < ORBIT_SETTLED_STEP_CM) {
    flushOrbitInertia()
    orbitMoving = false
  }
}

/** Whether a glide, orbit inertia or a smooth zoom is moving the camera. */
export function cameraGliding(): boolean {
  return glide !== null || orbitMoving || zoomGoalCm !== null
}

/** Frames the main canvas has rendered. */
export function renderedFrames(): number {
  return frames
}
