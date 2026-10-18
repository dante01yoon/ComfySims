import type { OrbitControls } from '@react-three/drei'
import type { RootState } from '@react-three/fiber'
import type { ComponentRef } from 'react'
import { Box3, type Object3D, type Scene } from 'three'

import { z } from 'zod'

import type { ApiWorkflow } from '../../harness/tools/lint-workflow.ts'
import { buildPhotoTo3dPrompt, buildProductPrompt, buildRenderPrompt, buildRoomPhotoPrompt, missingFromCatalog, studioPrompt } from '../../packages/comfy/src/index.ts'
import { fitGlbBytes } from '../../packages/fit/src/index.ts'
import { collisions, findSpot, itemsInZone, outOfBounds, zoneAt } from '../../packages/placement/src/index.ts'
import {
  Dimensions,
  MAX_CONCURRENT_JOBS,
  parseLayout,
  type Asset,
  type BackendKind,
  type FitReport,
  type Job,
  type JobKind,
  type JobStep,
  type Photo3dSource,
  type PlacedItem,
  type RoomLayout,
  type Zone
} from '../../packages/schema/src/index.ts'
import type {
  BackendState,
  ComfyFailure,
  DepthPanorama,
  EditorState,
  EditorView,
  JobWorkflow,
  Lighting,
  ProductRequest,
  RenderPasses,
  RenderRequest,
  RoomfitEditorApi,
  SceneItem,
  ScenePreset,
  Vec3,
  Viewer360
} from '../../spec/contracts/editor-api.ts'
import cloudPanorama from '../../workflows/cloud/pano360-from-depth.json'
import cloudPhoto from '../../workflows/cloud/photo-to-3d-moge.json'
import cloudProduct from '../../workflows/cloud/product-to-glb-pixal3d.json'
import localPhoto from '../../workflows/local/photo-to-3d-moge.json'
import localProduct from '../../workflows/product-to-glb.json'
import renderWorkflow from '../../workflows/render-from-depth.json'
import workflowSets from '../../workflows/sets.json'
import { catalogUrl, comfyOn, comfyOutputUri, generate, randomSeed, type ComfyInput, type ComfyRun } from './comfy.ts'
import * as edits from './edits.ts'
import { amend, commit, fresh, labels, redo, undo, type History } from './history.ts'
import { loadMesh, meshKey } from './meshes.ts'
import { boundsCenter, eyeLevelCamera, polygonBounds, roomBounds, standingPoint, studioCamera } from './framing.ts'
import { exportDepthPanorama, exportPasses } from './passes.ts'

type Gesture = 'none' | 'started' | 'editing'
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>
type Size = { width: number; height: number }
type CameraPose = { position: Vec3; target: Vec3 }
type PhotoViewer = EditorState['photoViewer']
type PanoramaViewer = Omit<Viewer360, 'stale'>

const MAX_PASS_SIZE = 8192
const DEFAULT_RENDER_SIZE: Size = { width: 1152, height: 896 }
const BACKEND_PATH = '/__roomfit/backend'
const WORKFLOW_FILES: Record<string, ApiWorkflow> = {
  'cloud/pano360-from-depth.json': cloudPanorama,
  'cloud/photo-to-3d-moge.json': cloudPhoto,
  'cloud/product-to-glb-pixal3d.json': cloudProduct,
  'local/photo-to-3d-moge.json': localPhoto,
  'product-to-glb.json': localProduct,
  'render-from-depth.json': renderWorkflow
}
const JOB_KINDS: readonly JobKind[] = ['product', 'render', 'photo3d', 'pano360']
const ServerBackend = z.object({ kind: z.enum(['local', 'cloud']), url: z.string(), localUrl: z.string(), cloudConfigured: z.boolean() })
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:8188'
const FOCUSED_WALL_CUT_CM = 110
const PHOTO_YAW_LIMIT_DEG = 20
const PHOTO_PITCH_LIMIT_DEG = 10
const PANORAMA_SIZE: Size = { width: 2048, height: 1024 }
const EYE_HEIGHT_CM = 160
const PANORAMA_PREFIX = 'equirectangular 360 image'
const VIEWER_PITCH_LIMIT_DEG = 80
const VIEWER_FOV_DEG = { min: 40, max: 100, start: 75 }

export type Editor = {
  history: History<RoomLayout>
  selectedId: string | null
  meshes: ReadonlyMap<string, Object3D | null>
  gesture: Gesture
  jobs: readonly Job[]
  lastRender: string | null
  openedRender: { image: string; caption: string } | null
  photoViewer: PhotoViewer
  viewer360: PanoramaViewer | null
  view: EditorView
  scene: ScenePreset
  focusedZone: string | null
  shootingEyeLevel: boolean
  lastRenderCamera: CameraPose | null
  agentConnected: boolean
  backend: BackendState
  localUrl: string
  revision: number
}

const SCENE_LIGHTING: Record<ScenePreset, Omit<Lighting, 'preset'>> = {
  work: { sunElevationDeg: 55, sunAzimuthDeg: 150, sunKelvin: 6000, sunIntensity: 3.0, interiorKelvin: 5000, interiorIntensity: 0.6 },
  reading: { sunElevationDeg: 35, sunAzimuthDeg: 200, sunKelvin: 4500, sunIntensity: 2.0, interiorKelvin: 3000, interiorIntensity: 1.0 },
  movie: { sunElevationDeg: 8, sunAzimuthDeg: 250, sunKelvin: 3200, sunIntensity: 0.4, interiorKelvin: 2400, interiorIntensity: 0.35 },
  evening: { sunElevationDeg: 4, sunAzimuthDeg: 270, sunKelvin: 2700, sunIntensity: 0.6, interiorKelvin: 2700, interiorIntensity: 1.4 }
}

const emptyLayout: RoomLayout = {
  version: 1,
  id: 'untitled',
  name: 'Untitled room',
  units: 'cm',
  room: { kind: 'box', width: 400, depth: 400, height: 250 },
  assets: [],
  items: []
}

let editor: Editor = {
  history: fresh(emptyLayout),
  selectedId: null,
  meshes: new Map(),
  gesture: 'none',
  jobs: [],
  lastRender: null,
  openedRender: null,
  photoViewer: null,
  viewer360: null,
  view: 'editor',
  scene: 'work',
  focusedZone: null,
  shootingEyeLevel: false,
  lastRenderCamera: null,
  agentConnected: false,
  backend: { kind: 'local', url: DEFAULT_LOCAL_URL, status: 'checking', unavailable: [], cloudConfigured: false },
  localUrl: DEFAULT_LOCAL_URL,
  revision: 0
}
const listeners = new Set<() => void>()

let getThree: (() => RootState) | null = null
let threeAttached = () => {}
const threeReady = new Promise<void>((resolve) => {
  threeAttached = resolve
})
let committedRevision = -1
let controls: OrbitControlsImpl | null = null
let actionLabel: string | null = null

function currentLabel(): string {
  return actionLabel ?? 'editor'
}

function update(change: Partial<Omit<Editor, 'revision'>>): void {
  editor = { ...editor, ...change, revision: editor.revision + 1 }
  listeners.forEach((listener) => listener())
}

function setHistory(history: History<RoomLayout>, gesture: Gesture = editor.gesture): void {
  const selectionExists = history.present.items.some((item) => item.id === editor.selectedId)
  update({ history, gesture, selectedId: selectionExists ? editor.selectedId : null })
}

function edit(next: RoomLayout): void {
  if (next === editor.history.present) return
  if (editor.gesture === 'editing') return setHistory(amend(editor.history, next))
  setHistory(commit(editor.history, next, currentLabel()), editor.gesture === 'started' ? 'editing' : 'none')
}

function requestMeshes(layout: RoomLayout): void {
  for (const asset of layout.assets) {
    const key = meshKey(asset)
    void loadMesh(asset).then((mesh) => {
      if (!editor.meshes.has(key)) update({ meshes: new Map(editor.meshes).set(key, mesh) })
    })
  }
}

function nextFrame(): Promise<number> {
  return new Promise(requestAnimationFrame)
}

async function rendered(): Promise<RootState> {
  await threeReady
  await Promise.all(editor.history.present.assets.map(loadMesh))
  while (committedRevision < editor.revision) await nextFrame()
  return getThree!()
}

function isPassSize({ width, height }: Size): boolean {
  return [width, height].every((side) => Number.isInteger(side) && side >= 1 && side <= MAX_PASS_SIZE)
}

function itemObjects(scene: Scene): Object3D[] {
  const found: Object3D[] = []
  scene.traverse((object) => {
    if (typeof object.userData.itemId === 'string') found.push(object)
  })
  return found
}

function sceneItem(object: Object3D): SceneItem {
  const { min, max } = new Box3().setFromObject(object)
  return {
    id: object.userData.itemId,
    worldBoundsCm: { min: { x: min.x, y: min.y, z: min.z }, max: { x: max.x, y: max.y, z: max.z } },
    highlighted: object.userData.highlighted === true,
    meshLoaded: object.userData.meshLoaded === true
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function snapshot(): Editor {
  return editor
}

export function attachThree(get: () => RootState): void {
  getThree = get
  threeAttached()
}

export function markCommitted(revision: number): void {
  committedRevision = Math.max(committedRevision, revision)
}

export function attachControls(instance: OrbitControlsImpl | null): void {
  controls = instance
}

/** Whether an MCP agent is attached to the bridge; shown as a badge in the workspace rail. */
export function setAgentConnected(agentConnected: boolean): void {
  if (agentConnected !== editor.agentConnected) update({ agentConnected })
}

export function select(id: string | null): void {
  if (id !== editor.selectedId) update({ selectedId: id })
}

export function beginDrag(id: string): void {
  if (controls) controls.enabled = false
  update({ selectedId: id, gesture: 'started' })
}

export function endDrag(): void {
  if (controls) controls.enabled = true
  if (editor.gesture !== 'none') update({ gesture: 'none' })
}

export async function loadUnknown(input: unknown): ReturnType<RoomfitEditorApi['load']> {
  const parsed = parseLayout(input)
  if (!parsed.ok) return { ok: false, issues: parsed.issues }
  update({ history: fresh(parsed.layout), selectedId: null, gesture: 'none', focusedZone: null })
  requestMeshes(parsed.layout)
  return { ok: true }
}

function state(): EditorState {
  const { history, selectedId } = editor
  return {
    layout: history.present,
    selectedId,
    collisions: collisions(history.present),
    outOfBounds: outOfBounds(history.present),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    jobs: [...editor.jobs],
    lastRender: editor.lastRender,
    view: editor.view,
    scene: editor.scene,
    focusedZone: editor.focusedZone,
    photoViewer: editor.photoViewer,
    viewer360: editor.viewer360 && { ...editor.viewer360, stale: isStalePanorama(editor.viewer360.jobId) },
    wallCutCm: wallCutCm(editor),
    lastRenderCamera: editor.lastRenderCamera,
    undoLabels: labels(history),
    agentConnected: editor.agentConnected,
    backend: editor.backend
  }
}

/** Height above which walls are not drawn: a dollhouse cutaway while a room is focused, except during its eye-level shot. */
export function wallCutCm({ history, focusedZone, shootingEyeLevel }: Editor): number {
  const { room } = history.present
  const full = room.kind === 'plan' ? room.wallHeight : room.height
  return focusedZone !== null && !shootingEyeLevel ? Math.min(FOCUSED_WALL_CUT_CM, full) : full
}

function zoneById(zoneId: string | null): Zone | undefined {
  const { room } = editor.history.present
  return room.kind === 'plan' ? room.zones.find(({ id }) => id === zoneId) : undefined
}

function focusedZone(): Zone | undefined {
  return zoneById(editor.focusedZone)
}

function focusFrame(): CameraPose {
  const zone = focusedZone()
  return zone ? studioCamera(polygonBounds(zone.polygon), 'room') : studioCamera(roomBounds(editor.history.present.room))
}

function eyeLevelShot(zone: Zone): CameraPose {
  const { items, assets } = editor.history.present
  const { min, max } = polygonBounds(zone.polygon)
  const footprints = items.flatMap(({ assetId, position: { x, z } }) => {
    const asset = assets.find(({ id }) => id === assetId)
    const inZone = x >= min.x && x <= max.x && z >= min.z && z <= max.z
    return asset && inZone ? [{ x, z, area: asset.dimensions.width * asset.dimensions.depth }] : []
  })
  return eyeLevelCamera(zone.polygon, footprints)
}

async function passesFrom(shot: CameraPose, size: Size): Promise<RenderPasses> {
  const previous = api.camera()
  update({ shootingEyeLevel: true })
  api.setCamera(shot)
  try {
    return await api.exportPasses(size)
  } finally {
    api.setCamera(previous)
    update({ shootingEyeLevel: false })
  }
}

function standingPointIn(zone: Zone): { x: number; z: number } {
  const layout = editor.history.present
  const clearances = layout.items.flatMap(({ assetId, position: { x, z } }) => {
    const asset = layout.assets.find(({ id }) => id === assetId)
    return asset ? [{ x, z, half: Math.max(asset.dimensions.width, asset.dimensions.depth) / 2 }] : []
  })
  return standingPoint(zone.polygon, clearances, (point) => zoneAt(layout, point) === zone.id)
}

async function depthPanoramaOf(zone: Zone): Promise<DepthPanorama> {
  const layout = editor.history.present
  const point = standingPointIn(zone)
  const ceiling = { heightCm: layout.room.kind === 'plan' ? layout.room.wallHeight : layout.room.height, covers: (at: { x: number; z: number }) => zoneAt(layout, at) !== null }
  update({ shootingEyeLevel: true })
  try {
    const { gl, scene } = await rendered()
    const image = exportDepthPanorama(gl, scene, { x: point.x, y: EYE_HEIGHT_CM, z: point.z }, ceiling, PANORAMA_SIZE)
    return { image, ...PANORAMA_SIZE, standingPoint: point, eyeHeightCm: EYE_HEIGHT_CM }
  } finally {
    update({ shootingEyeLevel: false })
  }
}

function focusZone(zoneId: string | null): void {
  const { room } = editor.history.present
  if (zoneId !== null && (room.kind !== 'plan' || !room.zones.some(({ id }) => id === zoneId))) return
  update({ focusedZone: zoneId })
  api.setCamera(focusFrame())
}

type Step = (status: JobStep) => void
type JobRun = ComfyRun & { id: string; backend: BackendKind; file: string; workflow: ApiWorkflow }
type Work<T> = (run: JobRun) => Promise<Finished<T> | ComfyFailure>
type Finished<T> = { ok: true; value: T; result: Job['result'] }
type Started<T> = ({ ok: true; jobId: string } & T) | ComfyFailure
type ProductPlaced = { itemId: string; report: Omit<FitReport, 'scale'> }

const retries = new Map<string, () => Promise<Started<unknown>>>()
const captions = new Map<string, string>()
const workflows = new Map<string, JobWorkflow & { url: string }>()
const waitingForSlot: (() => void)[] = []
let runningJobs = 0
let startedJobs = 0
let passExports: Promise<unknown> = Promise.resolve()

export function isFinished(job: Job): boolean {
  const last = job.steps.at(-1)?.status
  return last === 'done' || last === 'failed'
}

export function clearFinishedJobs(): void {
  update({ jobs: editor.jobs.filter((job) => !isFinished(job)) })
}

export function openRender(image: string, caption: string): void {
  update({ openedRender: { image, caption } })
}

export function closeRender(): void {
  update({ openedRender: null })
}

function addStep(id: string, status: JobStep, change: Partial<Job> = {}): void {
  const at = Date.now()
  update({ jobs: editor.jobs.map((job) => (job.id === id ? { ...job, ...change, steps: [...job.steps, { status, at }] } : job)) })
}

async function takeSlot(id: string): Promise<void> {
  if (runningJobs < MAX_CONCURRENT_JOBS) {
    runningJobs += 1
    return
  }
  addStep(id, 'queued')
  await new Promise<void>((resolve) => waitingForSlot.push(resolve))
}

function releaseSlot(): void {
  const next = waitingForSlot.shift()
  if (next) next()
  else runningJobs -= 1
}

async function settled<T>(work: () => Promise<Finished<T> | ComfyFailure>): Promise<Finished<T> | ComfyFailure> {
  try {
    return await work()
  } catch (error) {
    return { ok: false, reason: 'failed', message: String(error) }
  }
}

async function runJob<T>(
  kind: JobKind,
  title: string,
  work: Work<T>,
  retry: () => Promise<Started<unknown>>
): Promise<Started<T>> {
  const backend = editor.backend
  const blocked = cannotRun(backend, kind)
  if (blocked) return rejection(blocked)
  const id = `${kind}-${++startedJobs}`
  const file = workflowSets[backend.kind][kind]
  const workflow = WORKFLOW_FILES[file]
  if (!workflow) return rejection(`workflows/${file} is not bundled with the editor`)
  retries.set(id, retry)
  workflows.set(id, { file, backend: backend.kind, submitted: workflow, url: backend.url })
  update({ jobs: [...editor.jobs, { id, kind, title, backend: backend.kind, steps: [] }] })
  await takeSlot(id)
  const run: JobRun = {
    id,
    backend: backend.kind,
    file,
    workflow,
    comfy: comfyOn(backend.kind),
    step: (status) => addStep(id, status),
    submitted: (submitted) => workflows.set(id, { file, backend: backend.kind, submitted, url: backend.url })
  }
  const outcome = await settled(() => work(run))
  releaseSlot()
  if (!outcome.ok) {
    addStep(id, 'failed', { message: outcome.message })
    return { ...outcome, jobId: id }
  }
  addStep(id, 'done', { result: outcome.result })
  return { ok: true, jobId: id, ...outcome.value }
}

function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const turn = passExports.then(task, task)
  passExports = turn.catch(() => undefined)
  return turn
}

function rejection(message: string): ComfyFailure {
  return { ok: false, reason: 'rejected', message }
}

function uniqueId(name: string, taken: readonly { id: string }[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product'
  const ids = new Set(taken.map(({ id }) => id))
  let id = base
  for (let suffix = 2; ids.has(id); suffix++) id = `${base}-${suffix}`
  return id
}

function roundedToFloat32Noise(distortion: number): number {
  return Math.round(distortion * 1e4) / 1e4
}

async function blobAt(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}

function zoneName(zoneId: string): string {
  const { room } = editor.history.present
  return (room.kind === 'plan' ? room.zones.find(({ id }) => id === zoneId)?.name : undefined) ?? zoneId
}

type Placement = { ok: true; position: PlacedItem['position']; rotationY: number }

function placementIn(zoneId: string | null, dimensions: Dimensions): Placement | ComfyFailure {
  if (zoneId === null) return { ok: true, position: { x: 0, y: 0, z: 0 }, rotationY: 0 }
  const spot = findSpot(editor.history.present, zoneId, dimensions)
  if (spot.ok) return spot
  return spot.reason === 'no-space' ? { ok: false, reason: 'no-space', message: `No space in ${zoneName(zoneId)}` } : rejection(`there is no room called ${zoneId}`)
}

function placeItem(layout: RoomLayout, assetId: string, { position, rotationY }: Placement, label = currentLabel()): PlacedItem {
  const item: PlacedItem = { id: uniqueId(assetId, layout.items), assetId, position, rotationY }
  const next = { ...layout, items: [...layout.items, item] }
  setHistory(commit(editor.history, next, label), 'none')
  requestMeshes(next)
  return item
}

function productInput({ imageBase64, imageName, fileName }: ProductRequest): Promise<ComfyInput> | null {
  if ((imageBase64 === undefined) === (imageName === undefined)) return null
  if (imageName !== undefined) return Promise.resolve({ imageName })
  return blobAt(`data:application/octet-stream;base64,${imageBase64}`).then((file) => ({ file, fileName }))
}

function hasTag(workflow: ApiWorkflow, tag: string): boolean {
  return Object.values(workflow).some((node) => node._meta?.title === tag)
}

async function generateProduct(request: ProductRequest, run: JobRun, label: string): Promise<Finished<ProductPlaced> | ComfyFailure> {
  const mode = request.mode ?? 'exact'
  const name = request.name.trim()
  if (!name) return rejection('the product needs a name')
  if (!Dimensions.safeParse(request.dimensions).success) return rejection('width, depth and height must be positive centimeters')
  const zoneId = request.zoneId ?? editor.focusedZone
  const planned = placementIn(zoneId, request.dimensions)
  if (!planned.ok) return planned

  const pending = productInput(request)
  if (!pending) return rejection('the product needs exactly one of imageBase64 or imageName')
  const input = await pending
  const seed = request.seed ?? randomSeed()
  const { workflow } = run
  const generated = await generate(run, input, (imageName) =>
    hasTag(workflow, 'roomfit:fit')
      ? buildProductPrompt(workflow, { imageName, dimensions: request.dimensions, mode, seed })
      : buildPhotoTo3dPrompt(workflow, { imageName, seed })
  )
  if (!generated.ok) return generated

  run.step('fitting')
  const fitted = await fitGlbBytes(generated.bytes, request.dimensions, mode)
  if (!fitted.ok) return { ok: false, reason: 'unreadable', message: `the generated mesh cannot be fitted: ${fitted.reason}` }
  const { flagged, requested, yawDegrees } = fitted.report
  const distortion = roundedToFloat32Noise(fitted.report.distortion)
  const placement = placementIn(zoneId, request.dimensions)
  if (!placement.ok) return placement
  const layout = editor.history.present
  const asset: Asset = {
    id: uniqueId(name, layout.assets),
    name,
    uri: comfyOutputUri(generated.file, run.backend),
    dimensions: request.dimensions,
    source: { kind: 'generated', workflow: run.file.replace(/\.json$/, '') },
    fit: { mode, distortion }
  }
  const item = placeItem({ ...layout, assets: [...layout.assets, asset] }, asset.id, placement, label)
  return {
    ok: true,
    value: { itemId: item.id, report: { mode: fitted.report.mode, requested, yawDegrees, distortion, flagged } },
    result: 'file' in input ? { image: URL.createObjectURL(input.file), itemId: item.id } : { itemId: item.id }
  }
}

function addProductFromPhoto(request: ProductRequest): Promise<Started<ProductPlaced>> {
  const label = currentLabel()
  return runJob('product', `3D model · ${request.name.trim() || 'product'}`, (run) => generateProduct(request, run, label), () => addProductFromPhoto(request))
}

async function renderShot(request: RenderRequest, zone: Zone | undefined, run: JobRun): Promise<Finished<{ image: string }> | ComfyFailure> {
  const size = request.size ?? DEFAULT_RENDER_SIZE
  if (!isPassSize(size)) return rejection(`the render size must be whole pixels between 1 and ${MAX_PASS_SIZE}`)
  const seed = request.seed ?? randomSeed()
  const shot = zone ? eyeLevelShot(zone) : api.camera()
  update({ lastRenderCamera: shot })
  const passes = await oneAtATime(() => (zone ? passesFrom(shot, size) : api.exportPasses(size)))
  const depth = await blobAt(passes.depth)
  const generated = await generate(run, { file: depth, fileName: 'roomfit-depth.png' }, (depthImageName) =>
    buildRenderPrompt(run.workflow, { depthImageName, prompt: request.prompt, negativePrompt: request.negativePrompt ?? '', seed })
  )
  if (!generated.ok) return generated

  const image = URL.createObjectURL(new Blob([new Uint8Array(generated.bytes)], { type: 'image/png' }))
  update({ lastRender: image, openedRender: { image, caption: request.prompt } })
  return { ok: true, value: { image }, result: { image } }
}

function renderZone(request: RenderRequest, zone: Zone | undefined): Promise<Started<{ image: string }>> {
  const room = zone?.name ?? 'House'
  const render: Work<{ image: string }> = (run) => {
    captions.set(run.id, `Render · ${room}, ${editor.scene}`)
    return renderShot(request, zone, run)
  }
  return runJob('render', `Room render · ${room}`, render, () => renderZone(request, zone))
}

function renderInComfy(request: RenderRequest): Promise<Started<{ image: string }>> {
  return renderZone(request, focusedZone())
}

async function photoImage(source: Photo3dSource): Promise<{ ok: true; file: Blob; fileName: string; caption: string } | ComfyFailure> {
  if (source.kind === 'upload') {
    const file = await blobAt(`data:application/octet-stream;base64,${source.imageBase64}`)
    return { ok: true, file, fileName: source.fileName, caption: source.fileName }
  }
  const image = editor.jobs.find(({ id, kind }) => id === source.jobId && kind === 'render')?.result?.image
  if (!image) return rejection(`there is no finished render ${source.jobId}`)
  return { ok: true, file: await blobAt(image), fileName: 'roomfit-render.png', caption: captions.get(source.jobId) ?? 'Render' }
}

async function meshPhoto(source: Photo3dSource, run: JobRun): Promise<Finished<{ glb: string }> | ComfyFailure> {
  const photo = await photoImage(source)
  if (!photo.ok) return photo
  captions.set(run.id, photo.caption)
  const meshing: Step = (status) => run.step(status === 'generating' ? 'meshing' : status)
  const generated = await generate({ ...run, step: meshing }, photo, (imageName) => buildRoomPhotoPrompt(run.workflow, { imageName }))
  if (!generated.ok) return generated
  const glb = URL.createObjectURL(new Blob([new Uint8Array(generated.bytes)], { type: 'model/gltf-binary' }))
  return { ok: true, value: { glb }, result: { image: URL.createObjectURL(photo.file), glb } }
}

async function photo3d(source: Photo3dSource): Promise<Started<{ glb: string }>> {
  const subject = source.kind === 'upload' ? source.fileName : (editor.jobs.find(({ id }) => id === source.jobId)?.title.split(' · ')[1] ?? 'House')
  const opened = { render: editor.openedRender, photo: editor.photoViewer }
  const outcome = await runJob('photo3d', `3D photo · ${subject}`, (run) => meshPhoto(source, run), () => photo3d(source))
  const openedSince = editor.openedRender !== opened.render || editor.photoViewer !== opened.photo
  if (outcome.ok && !openedSince) openPhoto3d(outcome.jobId)
  return outcome
}

function openPhoto3d(jobId: string): void {
  const job = editor.jobs.find(({ id, kind }) => id === jobId && kind === 'photo3d')
  if (job?.result?.glb) update({ photoViewer: { jobId, yawDegrees: 0, pitchDegrees: 0 } })
}

function clamped(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value))
}

/** Turns the open 3D photo by the given degrees, kept within ±20° yaw and ±10° pitch. */
export function turnPhoto(yawDegrees: number, pitchDegrees: number): void {
  const viewer = editor.photoViewer
  if (!viewer) return
  update({
    photoViewer: {
      jobId: viewer.jobId,
      yawDegrees: clamped(viewer.yawDegrees + yawDegrees, PHOTO_YAW_LIMIT_DEG),
      pitchDegrees: clamped(viewer.pitchDegrees + pitchDegrees, PHOTO_PITCH_LIMIT_DEG)
    }
  })
}

type Panorama = { zoneId: string; itemsWhenTaken: string }

const panoramas = new Map<string, Panorama>()

function itemsSignature(layout: RoomLayout, zoneId: string): string {
  const inZone = new Set(itemsInZone(layout, zoneId))
  return JSON.stringify(layout.items.filter(({ id }) => inZone.has(id)))
}

/** Whether items in the room of a 360° view changed since its depth panorama was taken. */
export function isStalePanorama(jobId: string): boolean {
  const panorama = panoramas.get(jobId)
  return panorama !== undefined && itemsSignature(editor.history.present, panorama.zoneId) !== panorama.itemsWhenTaken
}

function panoramaPrompt(zone: Zone, prompt: string | undefined): string {
  const text = prompt ?? `${zone.name}, ${studioPrompt(zone.name, editor.scene)}`
  return text.startsWith(PANORAMA_PREFIX) ? text : `${PANORAMA_PREFIX}, ${text}`
}

async function panoramaShot(zone: Zone, prompt: string, run: JobRun): Promise<Finished<{ image: string }> | ComfyFailure> {
  const depth = await oneAtATime(() => {
    panoramas.set(run.id, { zoneId: zone.id, itemsWhenTaken: itemsSignature(editor.history.present, zone.id) })
    return depthPanoramaOf(zone)
  })
  const generated = await generate(run, { file: await blobAt(depth.image), fileName: 'roomfit-depth-pano.png' }, (depthImageName) =>
    buildRenderPrompt(run.workflow, { depthImageName, prompt, negativePrompt: '', seed: randomSeed() })
  )
  if (!generated.ok) return generated
  const image = URL.createObjectURL(new Blob([new Uint8Array(generated.bytes)], { type: 'image/png' }))
  return { ok: true, value: { image }, result: { image } }
}

async function panoramaOf(zoneId: string, prompt: string | undefined): Promise<Started<{ image: string }>> {
  const zone = zoneById(zoneId)
  if (!zone) return rejection(`there is no room called ${zoneId}`)
  const title = `360° view · ${zone.name}`
  if (editor.jobs.some((job) => job.kind === 'pano360' && job.title === title && !isFinished(job))) return rejection(`a 360° view of ${zone.name} is already being made`)
  const outcome = await runJob('pano360', title, (run) => panoramaShot(zone, panoramaPrompt(zone, prompt), run), () => panoramaOf(zoneId, prompt))
  if (outcome.ok) open360(outcome.jobId)
  return outcome
}

function view360({ zoneId, prompt }: { zoneId?: string; prompt?: string } = {}): ReturnType<RoomfitEditorApi['view360']> {
  const target = zoneId ?? editor.focusedZone
  return target === null ? Promise.resolve({ ok: false, reason: 'no-room' }) : panoramaOf(target, prompt)
}

function open360(jobId: string): void {
  const job = editor.jobs.find(({ id, kind }) => id === jobId && kind === 'pano360')
  const panorama = panoramas.get(jobId)
  if (job?.result?.image && panorama) update({ viewer360: { jobId, zoneId: panorama.zoneId, yawDegrees: 0, pitchDegrees: 0, fovDegrees: VIEWER_FOV_DEG.start } })
}

function wrappedDegrees(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180
}

/** Turns the open 360° view: yaw wraps around, pitch stays within ±80°. */
export function turn360(yawDegrees: number, pitchDegrees: number): void {
  const viewer = editor.viewer360
  if (!viewer) return
  update({
    viewer360: {
      ...viewer,
      yawDegrees: wrappedDegrees(viewer.yawDegrees + yawDegrees),
      pitchDegrees: clamped(viewer.pitchDegrees + pitchDegrees, VIEWER_PITCH_LIMIT_DEG)
    }
  })
}

/** Widens (positive) or narrows the open 360° view's field of view, kept within 40–100°. */
export function zoom360(fovDegrees: number): void {
  const viewer = editor.viewer360
  if (!viewer) return
  update({ viewer360: { ...viewer, fovDegrees: Math.min(VIEWER_FOV_DEG.max, Math.max(VIEWER_FOV_DEG.min, viewer.fovDegrees + fovDegrees)) } })
}

/** The caption of a job's source: the render's room and scene, or the uploaded file name. */
export function captionOf(jobId: string): string {
  return captions.get(jobId) ?? ''
}

async function retryJob(jobId: string): ReturnType<RoomfitEditorApi['retryJob']> {
  const retry = retries.get(jobId)
  if (!retry) return rejection(`there is no job ${jobId}`)
  const outcome = await retry()
  return outcome.ok ? { ok: true, jobId: outcome.jobId } : outcome
}

function placeAsset(assetId: string, zoneId?: string): ReturnType<RoomfitEditorApi['placeAsset']> {
  const layout = editor.history.present
  const asset = layout.assets.find(({ id }) => id === assetId)
  if (!asset) return { ok: false, reason: 'unknown-asset' }
  const target = zoneId ?? editor.focusedZone ?? zoneAt(layout, boundsCenter(roomBounds(layout.room))) ?? ''
  const spot = findSpot(layout, target, asset.dimensions)
  if (!spot.ok) return spot
  const item = placeItem(layout, asset.id, spot)
  update({ selectedId: item.id })
  return { ok: true, itemId: item.id }
}

function renameZone(zoneId: string, name: string): ReturnType<RoomfitEditorApi['renameZone']> {
  const layout = editor.history.present
  const { room } = layout
  if (room.kind !== 'plan' || !room.zones.some(({ id }) => id === zoneId)) return { ok: false, reason: 'unknown-zone' }
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty-name' }
  const zones = room.zones.map((zone) => (zone.id === zoneId ? { ...zone, name: trimmed } : zone))
  setHistory(commit(editor.history, { ...layout, room: { ...room, zones } }, currentLabel()), 'none')
  return { ok: true }
}

/** Why a backend cannot run a job kind (the node classes or model files its ComfyUI lacks), or undefined when it can. */
export function cannotRun(backend: BackendState, kind: JobKind): string | undefined {
  const blocked = backend.unavailable.find((entry) => entry.kind === kind)
  return blocked && `This ComfyUI does not have ${blocked.missing.join(', ')}`
}

type ServerBackend = z.infer<typeof ServerBackend>

let backendChecks = 0

async function jsonAt(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const response = await fetch(url, init)
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

async function readinessOf(kind: BackendKind): Promise<Pick<BackendState, 'status' | 'unavailable'>> {
  const catalog = z.record(z.string(), z.unknown()).safeParse(await jsonAt(catalogUrl(kind)))
  if (!catalog.success) return { status: 'unreachable', unavailable: [] }
  const unavailable = JOB_KINDS.flatMap((job) => {
    const workflow = WORKFLOW_FILES[workflowSets[kind][job]]
    const missing = workflow ? missingFromCatalog(workflow, catalog.data, kind) : [workflowSets[kind][job]]
    return missing.length > 0 ? [{ kind: job, missing }] : []
  })
  return { status: 'ready', unavailable }
}

async function serverBackend(init?: RequestInit): Promise<ServerBackend> {
  const parsed = ServerBackend.safeParse(await jsonAt(BACKEND_PATH, init))
  if (parsed.success) return parsed.data
  return init ? serverBackend() : { kind: 'local', url: location.origin, localUrl: location.origin, cloudConfigured: false }
}

async function checked({ localUrl, ...server }: ServerBackend): Promise<BackendState> {
  const check = ++backendChecks
  update({ backend: { ...server, status: 'checking', unavailable: [] }, localUrl })
  const backend = { ...server, ...(await readinessOf(server.kind)) }
  if (check === backendChecks) update({ backend })
  return backend
}

async function checkBackend(): Promise<BackendState> {
  return checked(await serverBackend())
}

async function setBackend(choice: { kind: BackendKind; url?: string }): Promise<BackendState> {
  return checked(await serverBackend({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(choice) }))
}

/** The job's workflow file, backend and its URL, and the graph it submitted (its template until roomfit has filled it). */
export function ranWorkflow(jobId: string): (JobWorkflow & { url: string }) | null {
  return workflows.get(jobId) ?? null
}

function jobWorkflow(jobId: string): JobWorkflow | null {
  const ran = workflows.get(jobId)
  return ran ? { file: ran.file, backend: ran.backend, submitted: ran.submitted } : null
}

async function screenshot(): Promise<string> {
  const { gl, scene, camera } = await rendered()
  gl.render(scene, camera)
  return gl.domElement.toDataURL('image/png')
}

/** The `window.roomfit` implementation; UI gestures call these same functions. */
export const api: RoomfitEditorApi = {
  ready: () => threeReady,
  load: loadUnknown,
  save: () => structuredClone(editor.history.present),
  state,
  scene: async () => itemObjects((await rendered()).scene).map(sceneItem),
  moveItem: (id, position) => edit(edits.moveItem(editor.history.present, id, position)),
  rotateItem: (id, rotationY) => edit(edits.rotateItem(editor.history.present, id, rotationY)),
  removeItem: (id) => edit(edits.removeItem(editor.history.present, id)),
  undo: () => setHistory(undo(editor.history), 'none'),
  redo: () => setHistory(redo(editor.history), 'none'),
  setCamera: ({ position, target }) => {
    if (!getThree) return
    const { camera } = getThree()
    camera.position.set(position.x, position.y, position.z)
    camera.lookAt(target.x, target.y, target.z)
    controls?.target.set(target.x, target.y, target.z)
    controls?.update()
  },
  exportPasses: async (size) => {
    if (!isPassSize(size)) throw new RangeError(`pass size must be whole pixels between 1 and ${MAX_PASS_SIZE}`)
    const { gl, scene, camera } = await rendered()
    return exportPasses(gl, scene, camera, size)
  },
  addProductFromPhoto,
  renderInComfy,
  placeAsset,
  renameZone,
  photo3d,
  retryJob,
  openPhoto3d,
  closePhoto3d: () => update({ photoViewer: null }),
  setView: (view) => {
    update({ view })
    if (view === 'studio') api.setCamera(focusFrame())
  },
  setScene: (scene) => update({ scene }),
  lighting: () => ({ preset: editor.scene, ...SCENE_LIGHTING[editor.scene] }),
  camera: () => {
    const position = getThree?.().camera.position ?? { x: 0, y: 0, z: 0 }
    const target = controls?.target ?? { x: 0, y: 0, z: 0 }
    return { position: { x: position.x, y: position.y, z: position.z }, target: { x: target.x, y: target.y, z: target.z } }
  },
  focusZone,
  screenshot,
  depthPanorama: (zoneId) => {
    const zone = zoneById(zoneId)
    return zone ? oneAtATime(() => depthPanoramaOf(zone)) : Promise.resolve({ ok: false, reason: 'unknown-zone' })
  },
  view360,
  open360,
  close360: () => update({ viewer360: null }),
  backend: () => editor.backend,
  setBackend,
  checkBackend,
  jobWorkflow,
  setActionLabel: (label) => {
    actionLabel = label
  }
}
