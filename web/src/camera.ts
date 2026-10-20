import type { OrbitControls } from '@react-three/drei'
import type { RootState } from '@react-three/fiber'
import type { ComponentRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'

import { frameSeconds, orbitDampingFactor, orbitMotion } from '../../packages/motion/src/index.ts'
import type { Vec3 } from '../../spec/contracts/editor-api.ts'
import type { Lens } from './framing.ts'

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>
export type CameraPose = { position: Vec3; target: Vec3 }
/** A pose that depends on the lens, so it can be refitted when the uncovered part of the canvas changes. */
export type Frame = (lens: Lens) => CameraPose
type Glide = { from: CameraPose; to: CameraPose; startedAt: number; seconds: number }

const GLIDE_SECONDS = { shortest: 0.6, longest: 1.0 }
const GLIDE_LONGEST_AT_CM = 1500
const GLIDE_SKIPPED_BELOW_CM = 0.5
const ZOOM_SECONDS = 0.12
const ZOOM_PER_WHEEL_PIXEL = 1.0015
const ZOOM_DISTANCE_CM = { min: 100, max: 12000 }
const ZOOM_SETTLED_CM = 0.05

let getThree: (() => RootState) | null = null
let controls: OrbitControlsImpl | null = null
let glide: Glide | null = null
let heldFrame: Frame | null = null
let zoomGoalCm: number | null = null
let walking = false
let itemDragging = false
let orbitDragging = false
let orbitMoving = false
let lastFrameAt = 0
let lastFrameSeconds = 0
let motionContinues = false
let positionBeforeControls: Vec3 = { x: 0, y: 0, z: 0 }
let frames = 0

const startOrbitDrag = () => {
  orbitDragging = true
  heldFrame = null
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
  if (value) heldFrame = null
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
  heldFrame = null
  zoomGoalCm = null
  flushOrbitInertia()
  applyPose(pose)
  settle()
}

/** Moves the camera from where it is on screen to a pose with an ease-in-out glide. */
export function glideTo(to: CameraPose): void {
  const from = cameraFrame()
  if (poseDistanceCm(from, to) < GLIDE_SKIPPED_BELOW_CM) return jumpTo(to)
  heldFrame = null
  zoomGoalCm = null
  flushOrbitInertia()
  glide = { from, to, startedAt: performance.now(), seconds: glideSeconds(from, to) }
  syncControls()
  invalidate()
}

function viewportHolding(canvas: HTMLCanvasElement): Element | null {
  return canvas.parentElement?.parentElement?.offsetParent ?? null
}

/** Width in CSS pixels of the part of the canvas that no panel covers, measured from the page now. */
export function uncoveredWidth(canvas: HTMLCanvasElement, canvasWidth: number): number {
  return Math.min(canvasWidth, viewportHolding(canvas)?.clientWidth ?? canvasWidth)
}

/** Follows changes to the part of the canvas that no panel covers. */
export function observeUncovered(canvas: HTMLCanvasElement, changed: () => void): () => void {
  const host = viewportHolding(canvas)
  if (!host) return () => undefined
  const observer = new ResizeObserver(changed)
  observer.observe(host)
  return () => observer.disconnect()
}

function lens(): Lens {
  if (!getThree) return { fovDeg: 50, aspect: 1 }
  const { camera, gl, size } = getThree()
  const fovDeg = camera instanceof PerspectiveCamera ? camera.fov : 50
  return { fovDeg, aspect: uncoveredWidth(gl.domElement, size.width) / size.height }
}

/** Glides to a lens-dependent pose and keeps refitting it to the lens until something else moves the camera. */
export function glideToFrame(frame: Frame): void {
  glideTo(frame(lens()))
  heldFrame = frame
}

/** Refits a held frame after the lens changed, for example when a panel opens or closes over the canvas. */
export function lensChanged(): void {
  if (!heldFrame) return
  if (glide) glide.to = heldFrame(lens())
  else glideToFrame(heldFrame)
  invalidate()
}

/** Changes where the camera is going: the end of a running glide, else the pose on screen. */
export function retarget(to: CameraPose): void {
  heldFrame = null
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
  heldFrame = null
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

/** Runs before the orbit controls each frame: glide, smooth zoom and frame-rate independent damping. */
export function advanceCamera(now: number): void {
  frames += 1
  const seconds = frameSeconds(now - lastFrameAt, motionContinues)
  lastFrameAt = now
  lastFrameSeconds = seconds
  if (controls) controls.dampingFactor = orbitDampingFactor(seconds)
  if (glide) {
    const progress = (now - glide.startedAt) / (glide.seconds * 1000)
    if (progress >= 1) finishGlide()
    else applyPose({ position: mix(glide.from.position, glide.to.position, easeInOut(progress)), target: mix(glide.from.target, glide.to.target, easeInOut(progress)) })
  }
  if (zoomGoalCm !== null) zoomStep(zoomGoalCm, seconds)
  if (glide || zoomGoalCm !== null) invalidate()
  positionBeforeControls = copy(getThree?.().camera.position ?? positionBeforeControls)
}

function orbitStillCoasting(): boolean {
  if (!getThree || !controls?.enabled) return false
  const motion = orbitMotion(distanceCm(getThree().camera.position, positionBeforeControls), lastFrameSeconds)
  if (motion !== 'slow' || orbitDragging || zoomGoalCm !== null) return motion !== 'still'
  flushOrbitInertia()
  return false
}

/** Runs after the orbit controls each frame: notices inertia and stops it once it has slowed to a crawl. */
export function settleOrbit(): void {
  orbitMoving = orbitStillCoasting()
  motionContinues = cameraGliding()
}

/** Whether a glide, orbit inertia or a smooth zoom is moving the camera. */
export function cameraGliding(): boolean {
  return glide !== null || orbitMoving || zoomGoalCm !== null
}

/** Where a world point appears on the page in CSS pixels through the camera on screen; null behind the camera. */
export function projectToScreen({ x, y, z }: Vec3): { x: number; y: number } | null {
  if (!getThree) return null
  const { camera, gl } = getThree()
  camera.updateMatrixWorld()
  const inView = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse)
  if (inView.z >= 0) return null
  const clip = inView.applyMatrix4(camera.projectionMatrix)
  const rect = gl.domElement.getBoundingClientRect()
  return { x: rect.left + ((clip.x + 1) / 2) * rect.width, y: rect.top + ((1 - clip.y) / 2) * rect.height }
}

/** Frames the main canvas has rendered. */
export function renderedFrames(): number {
  return frames
}
