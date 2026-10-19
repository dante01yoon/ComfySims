import type { OrbitControls } from '@react-three/drei'
import type { RootState } from '@react-three/fiber'
import type { ComponentRef } from 'react'
import { Box3, type Object3D, type PerspectiveCamera, type Scene } from 'three'

import { z } from 'zod'

import type { ApiWorkflow } from '../../harness/tools/lint-workflow.ts'
import { buildPhotoTo3dPrompt, buildProductPrompt, buildRenderPrompt, buildRoomPhotoPrompt, type RenderStyle, scenePrompt } from '../../packages/comfy/src/index.ts'
import { fitGlbBytes } from '../../packages/fit/src/index.ts'
import { collisions, defaultSite, findSpot, frontDoor, houseExtent, itemsInZone, outOfBounds, zoneAt } from '../../packages/placement/src/index.ts'
import {
  ApiGraph,
  AssetLabels,
  AssetProduct,
  Dimensions,
  MAX_CONCURRENT_JOBS,
  parseLayout,
  type Asset,
  type BackendKind,
  type Blueprint,
  type FitReport,
  type GenerationChoice,
  type Job,
  type JobKind,
  type JobStep,
  type Photo3dSource,
  type PlacedItem,
  type PlanRoom,
  type RoomLayout,
  type Site,
  type Zone
} from '../../packages/schema/src/index.ts'
import type {
  BackendState,
  ComfyFailure,
  DepthPanorama,
  EditorState,
  EditorView,
  ExteriorShot,
  ExteriorView,
  Issues,
  JobWorkflow,
  Lighting,
  ProductRequest,
  RenderPasses,
  RenderRequest,
  RoomfitEditorApi,
  SceneItem,
  ScenePreset,
  Vec3,
  Viewer360,
  WorkflowChoice
} from '../../spec/contracts/editor-api.ts'
import { catalogUrl, comfyOn, comfyOutputUri, generate, randomSeed, type ComfyInput, type ComfyRun } from './comfy.ts'
import * as edits from './edits.ts'
import { amend, commit, fresh, labels, redo, undo, type History } from './history.ts'
import { loadMesh, meshKey } from './meshes.ts'
import { aerialCamera, boundsCenter, boxCorners, exteriorDepthRange, eyeLevelCamera, polygonBounds, roomBounds, standingPoint, streetCamera, studioCamera } from './framing.ts'
import { exportDepthPanorama, exportPasses } from './passes.ts'
import { chosenWorkflow, CUSTOM_PREFIX, MAX_CUSTOM_WORKFLOWS, missingTags, unavailableJobs, workflowChoiceOf, workflowKindOf, type Catalog } from './workflows.ts'

type Gesture = 'none' | 'started' | 'editing'
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>
type Size = { width: number; height: number }
type CameraPose = { position: Vec3; target: Vec3 }
type PhotoViewer = EditorState['photoViewer']
type PanoramaViewer = Omit<Viewer360, 'stale'>

const MAX_PASS_SIZE = 8192
const DEFAULT_RENDER_SIZE: Size = { width: 1152, height: 896 }
const BACKEND_PATH = '/__roomfit/backend'
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
const PHOTO_THUMBNAIL_PX = 256
const PHOTO_THUMBNAIL_MAX_CHARS = 56_000
const PHOTO_THUMBNAIL_QUALITIES = [0.85, 0.7, 0.5, 0.3, 0.15]
const ROOF_ABOVE_WALLS_CM = 20
const EXTERIOR_SIZE: Size = { width: 1024, height: 576 }
const EXTERIOR_FOV_DEG = 50
const EXTERIOR_TITLES: Record<ExteriorView, string> = { aerial: 'Exterior render · Aerial', street: 'Exterior render · Street' }
const GROUND_WORDS: Record<Site['ground'], string> = { grass: 'green lawn', gravel: 'gravel yard', paving: 'paved courtyard', soil: 'bare soil garden' }

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
  catalog: Catalog | null
  localUrl: string
  libraryFilter: string | null
  blueprintOpacity: number
  blueprintHidden: boolean
  exterior: ExteriorShot | null
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
  catalog: null,
  localUrl: DEFAULT_LOCAL_URL,
  libraryFilter: null,
  blueprintOpacity: 50,
  blueprintHidden: false,
  exterior: null,
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

function withReadiness(next: Editor): Editor {
  return { ...next, backend: { ...next.backend, unavailable: unavailableJobs(next.history.present, next.backend.kind, next.catalog) } }
}

function update(change: Partial<Omit<Editor, 'revision'>>): void {
  const next = { ...editor, ...change, revision: editor.revision + 1 }
  editor = 'history' in change || 'backend' in change || 'catalog' in change ? withReadiness(next) : next
  listeners.forEach((listener) => listener())
}

function setHistory(history: History<RoomLayout>, gesture: Gesture = editor.gesture): void {
  const selectionExists = history.present.items.some((item) => item.id === editor.selectedId)
  update({ history, gesture, selectedId: selectionExists ? editor.selectedId : null, libraryFilter: labelInUse(history.present, editor.libraryFilter) })
}

/** Whether an asset carries the label, ignoring case. */
export function hasLabel(asset: Asset, label: string): boolean {
  return (asset.labels ?? []).some((entry) => entry.toLowerCase() === label.toLowerCase())
}

/** Every label on the library's assets, ignoring case, with how many assets carry it, in first-use order. */
export function labelsInUse(layout: RoomLayout): { label: string; count: number }[] {
  const counts = new Map<string, { label: string; count: number }>()
  for (const label of layout.assets.flatMap((asset) => asset.labels ?? [])) {
    const seen = counts.get(label.toLowerCase())
    counts.set(label.toLowerCase(), { label: seen?.label ?? label, count: (seen?.count ?? 0) + 1 })
  }
  return [...counts.values()]
}

function labelInUse(layout: RoomLayout, label: string | null): string | null {
  return label === null ? null : (labelsInUse(layout).find((entry) => entry.label.toLowerCase() === label.toLowerCase())?.label ?? null)
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
  const { blueprint } = editor.history.present
  if (blueprint) await requestBlueprint(blueprint.image)
  while (committedRevision < editor.revision) await nextFrame()
  return getThree!()
}

function isPassSize({ width, height }: Size): boolean {
  return [width, height].every((side) => Number.isInteger(side) && side >= 1 && side <= MAX_PASS_SIZE)
}

function itemObjects(scene: Scene): Object3D[] {
  const found: Object3D[] = []
  scene.traverse((object) => {
    if (typeof sceneIdOf(object) === 'string') found.push(object)
  })
  return found
}

function sceneIdOf(object: Object3D): unknown {
  return object.userData.itemId ?? object.userData.sceneId
}

function sceneItem(object: Object3D): SceneItem {
  const { min, max } = new Box3().setFromObject(object)
  return {
    id: String(sceneIdOf(object)),
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
  update({ history: fresh(parsed.layout), selectedId: null, gesture: 'none', focusedZone: null, libraryFilter: null })
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
    backend: editor.backend,
    libraryFilter: editor.libraryFilter,
    renderStyle: renderStyleOf(history.present),
    site: siteOf(history.present),
    blueprintOpacity: editor.blueprintOpacity
  }
}

/** The layout's site, or the default one around its house. */
export function siteOf(layout: RoomLayout): Site {
  return layout.site ?? defaultSite(layout.room)
}

const blueprintLoads = new Map<string, Promise<HTMLImageElement | null>>()
const blueprintImages = new Map<string, HTMLImageElement>()

function requestBlueprint(url: string): Promise<HTMLImageElement | null> {
  const known = blueprintLoads.get(url)
  if (known) return known
  const loading = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  }).then((image) => {
    if (image) blueprintImages.set(url, image)
    update({})
    return image
  })
  blueprintLoads.set(url, loading)
  return loading
}

/** The decoded blueprint image once it has loaded; starts loading it otherwise. */
export function blueprintImage(url: string): HTMLImageElement | undefined {
  void requestBlueprint(url)
  return blueprintImages.get(url)
}

/** Shows or hides the blueprint underlay in the plan view. */
export function setBlueprintHidden(blueprintHidden: boolean): void {
  update({ blueprintHidden })
}

function committedIfValid(next: unknown): { ok: true } | { ok: false; issues: Issues } {
  const parsed = parseLayout(next)
  if (!parsed.ok) return { ok: false, issues: parsed.issues }
  commitLayout(parsed.layout, currentLabel())
  return { ok: true }
}

function setHousePlan(room: PlanRoom): ReturnType<RoomfitEditorApi['setHousePlan']> {
  const layout = editor.history.present
  const planned = parseLayout({ ...layout, room })
  if (!planned.ok) return { ok: false, issues: planned.issues }
  const movedToLibrary = layout.items.filter(({ position }) => zoneAt(planned.layout, position) === null).map(({ id }) => id)
  const outcome = committedIfValid({ ...planned.layout, items: planned.layout.items.filter(({ id }) => !movedToLibrary.includes(id)) })
  if (!outcome.ok) return outcome
  if (!zoneById(editor.focusedZone)) update({ focusedZone: null })
  return { ok: true, movedToLibrary }
}

function setSite(site: Site | null): ReturnType<RoomfitEditorApi['setSite']> {
  const { site: _, ...layout } = editor.history.present
  return committedIfValid(site === null ? layout : { ...layout, site })
}

function setBlueprint(blueprint: Blueprint | null): ReturnType<RoomfitEditorApi['setBlueprint']> {
  const { blueprint: _, ...layout } = editor.history.present
  return committedIfValid(blueprint === null ? layout : { ...layout, blueprint })
}

function exteriorShot(view: ExteriorView): ExteriorShot {
  const layout = editor.history.present
  const house = houseExtent(layout.room)
  const site = siteOf(layout)
  const wallHeight = layout.room.kind === 'plan' ? layout.room.wallHeight : layout.room.height
  const topCm = wallHeight + ROOF_ABOVE_WALLS_CM
  const lens = { fovDeg: EXTERIOR_FOV_DEG, aspect: EXTERIOR_SIZE.width / EXTERIOR_SIZE.height }
  const pose = view === 'aerial' ? aerialCamera(house, topCm, lens) : streetCamera(frontDoor(layout.room), site.lot, house)
  return {
    camera: { ...pose, ...lens },
    roof: { topCm, min: house.min, max: house.max },
    depthRange: exteriorDepthRange(view, pose, boxCorners(house, topCm), site.lot),
    trees: false
  }
}

async function exteriorPasses(shot: ExteriorShot, size: Size): Promise<RenderPasses> {
  const previousView = editor.view
  update({ view: 'studio', exterior: shot, shootingEyeLevel: true })
  try {
    const { gl, scene, camera } = await rendered()
    const view = camera.clone() as PerspectiveCamera
    const { position, target, fovDeg } = shot.camera
    view.fov = fovDeg
    view.position.set(position.x, position.y, position.z)
    view.lookAt(target.x, target.y, target.z)
    view.updateMatrixWorld()
    return exportPasses(gl, scene, view, size, shot.depthRange)
  } finally {
    update({ view: previousView, exterior: null, shootingEyeLevel: false })
  }
}

function exteriorPrompt(site: Site): string {
  return `Exterior architectural photograph of a modern single-storey house, flat roof, white render walls, large windows, ${GROUND_WORDS[site.ground]}, trees, clear sky, photorealistic`
}

function renderExterior(view: ExteriorView): Promise<Started<{ image: string }>> {
  const title = EXTERIOR_TITLES[view]
  const render: Work<{ image: string }> = (run) => {
    captions.set(run.id, title)
    const shot = exteriorShot(view)
    const request = { prompt: exteriorPrompt(siteOf(editor.history.present)), size: EXTERIOR_SIZE }
    return renderDepth(request, run, shot.camera, (size) => exteriorPasses(shot, size))
  }
  return runJob('render', title, render, () => renderExterior(view))
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
  const inZone = ({ x, z }: { x: number; z: number }) => x >= min.x && x <= max.x && z >= min.z && z <= max.z
  const footprints = items.flatMap(({ assetId, position }) => {
    const asset = assets.find(({ id }) => id === assetId)
    return asset && inZone(position) ? [{ x: position.x, z: position.z, area: asset.dimensions.width * asset.dimensions.depth }] : []
  })
  const selected = items.find(({ id }) => id === editor.selectedId)?.position
  return eyeLevelCamera(zone.polygon, footprints, selected && inZone(selected) ? selected : undefined)
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
type ProductPlaced = { itemId: string | null; assetId: string; report: Omit<FitReport, 'scale'> }

const retries = new Map<string, () => Promise<Started<unknown>>>()
const captions = new Map<string, string>()
const workflows = new Map<string, JobWorkflow & { url: string }>()
const libraryAdds = new Map<string, string>()
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
  const { id: file, graph: workflow } = chosenWorkflow(editor.history.present, backend.kind, kind)
  if (!workflow) return rejection(`there is no workflow ${file}`)
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
  commitLayout({ ...layout, items: [...layout.items, item] }, label)
  return item
}

function commitLayout(next: RoomLayout, label: string): void {
  setHistory(commit(editor.history, next, label), 'none')
  requestMeshes(next)
}

function productInput({ imageBase64, imageName, fileName }: ProductRequest): Promise<ComfyInput> | null {
  if ((imageBase64 === undefined) === (imageName === undefined)) return null
  if (imageName !== undefined) return Promise.resolve({ imageName })
  return blobAt(`data:application/octet-stream;base64,${imageBase64}`).then((file) => ({ file, fileName }))
}

/** A blob as a `data:` URL. */
export function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function photoThumbnail(photo: Blob): Promise<string | undefined> {
  const bitmap = await createImageBitmap(photo).catch(() => null)
  if (!bitmap) return undefined
  const scale = Math.min(1, PHOTO_THUMBNAIL_PX / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)))
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  for (const quality of PHOTO_THUMBNAIL_QUALITIES) {
    const thumbnail = await dataUrlOf(await canvas.convertToBlob({ type: 'image/jpeg', quality }))
    if (thumbnail.length <= PHOTO_THUMBNAIL_MAX_CHARS) return thumbnail
  }
  return undefined
}

function filled(text: string | undefined): string | undefined {
  return text?.trim() || undefined
}

type ProductDetails = { ok: true; product: AssetProduct; labels: string[] }

function productDetails({ productUrl, brand, store, labels = [] }: ProductRequest): ProductDetails | ComfyFailure {
  const product = AssetProduct.safeParse({ url: filled(productUrl), brand: filled(brand), store: filled(store) })
  if (!product.success) return rejection(product.error.issues[0]?.message ?? 'the product link, brand or store is invalid')
  const parsedLabels = AssetLabels.safeParse(labels)
  if (!parsedLabels.success) return rejection(parsedLabels.error.issues[0]?.message ?? 'the labels are invalid')
  return { ok: true, product: product.data, labels: parsedLabels.data }
}

function hasTag(workflow: ApiWorkflow, tag: string): boolean {
  return Object.values(workflow).some((node) => node._meta?.title === tag)
}

async function generateProduct(request: ProductRequest, run: JobRun, label: string): Promise<Finished<ProductPlaced> | ComfyFailure> {
  const mode = request.mode ?? 'exact'
  const name = request.name.trim()
  if (!name) return rejection('the product needs a name')
  if (!Dimensions.safeParse(request.dimensions).success) return rejection('width, depth and height must be positive centimeters')
  const details = productDetails(request)
  if (!details.ok) return details
  const place = request.place ?? true
  const zoneId = place ? (request.zoneId ?? editor.focusedZone) : null
  const planned = placementIn(zoneId, request.dimensions)
  if (!planned.ok) return planned

  const pending = productInput(request)
  if (!pending) return rejection('the product needs exactly one of imageBase64 or imageName')
  const input = await pending
  const thumbnail = 'file' in input ? photoThumbnail(input.file) : Promise.resolve(undefined)
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
  const photo = await thumbnail
  const layout = editor.history.present
  const asset: Asset = {
    id: uniqueId(name, layout.assets),
    name,
    uri: comfyOutputUri(generated.file, run.backend),
    dimensions: request.dimensions,
    source: { kind: 'generated', workflow: run.file.replace(/\.json$/, '') },
    fit: { mode, distortion },
    product: photo ? { ...details.product, photo: { thumbnail: photo, comfyInputName: generated.inputName } } : details.product,
    labels: details.labels
  }
  const withAsset = { ...layout, assets: [...layout.assets, asset] }
  const item = place ? placeItem(withAsset, asset.id, placement, label) : null
  if (!item) {
    commitLayout(withAsset, label)
    libraryAdds.set(run.id, asset.id)
  }
  const added = item ? { itemId: item.id } : {}
  return {
    ok: true,
    value: { itemId: item?.id ?? null, assetId: asset.id, report: { mode: fitted.report.mode, requested, yawDegrees, distortion, flagged } },
    result: 'file' in input ? { image: URL.createObjectURL(input.file), ...added } : added
  }
}

function addProductFromPhoto(request: ProductRequest): Promise<Started<ProductPlaced>> {
  const label = currentLabel()
  return runJob('product', `3D model · ${request.name.trim() || 'product'}`, (run) => generateProduct(request, run, label), () => addProductFromPhoto(request))
}

function renderShot(request: RenderRequest, zone: Zone | undefined, run: JobRun): Promise<Finished<{ image: string }> | ComfyFailure> {
  const shot = zone ? eyeLevelShot(zone) : api.camera()
  return renderDepth(request, run, shot, (size) => (zone ? passesFrom(shot, size) : api.exportPasses(size)))
}

async function renderDepth(request: RenderRequest, run: JobRun, shot: CameraPose, passesAt: (size: Size) => Promise<RenderPasses>): Promise<Finished<{ image: string }> | ComfyFailure> {
  const size = request.size ?? DEFAULT_RENDER_SIZE
  if (!isPassSize(size)) return rejection(`the render size must be whole pixels between 1 and ${MAX_PASS_SIZE}`)
  const seed = request.seed ?? randomSeed()
  update({ lastRenderCamera: shot })
  const passes = await oneAtATime(() => passesAt(size))
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

function renderStyleOf(layout: RoomLayout): RenderStyle {
  return layout.renderStyle ?? 'lived-in'
}

/** The layout-aware prompts for a room (or the whole home) under the current scene and render style. */
export function currentScenePrompt(zoneId: string | null): { positive: string; negative: string } {
  const layout = editor.history.present
  return scenePrompt(layout, zoneId, editor.scene, renderStyleOf(layout))
}

function setRenderStyle(style: RenderStyle): void {
  const layout = editor.history.present
  if (renderStyleOf(layout) !== style) setHistory(commit(editor.history, { ...layout, renderStyle: style }, currentLabel()), 'none')
}

function renderInComfy(request: RenderRequest): Promise<Started<{ image: string }>> {
  const zone = focusedZone()
  return renderZone({ ...request, negativePrompt: request.negativePrompt ?? currentScenePrompt(zone?.id ?? null).negative }, zone)
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
  const text = prompt ?? `${zone.name}, ${currentScenePrompt(zone.id).positive}`
  return text.startsWith(PANORAMA_PREFIX) ? text : `${PANORAMA_PREFIX}, ${text}`
}

async function panoramaShot(zone: Zone, prompt: string, run: JobRun): Promise<Finished<{ image: string }> | ComfyFailure> {
  const depth = await oneAtATime(() => {
    panoramas.set(run.id, { zoneId: zone.id, itemsWhenTaken: itemsSignature(editor.history.present, zone.id) })
    return depthPanoramaOf(zone)
  })
  const generated = await generate(run, { file: await blobAt(depth.image), fileName: 'roomfit-depth-pano.png' }, (depthImageName) =>
    buildRenderPrompt(run.workflow, { depthImageName, prompt, negativePrompt: currentScenePrompt(zone.id).negative, seed: randomSeed() })
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

/** The asset a product job added to the library without placing it. */
export function libraryAssetOf(jobId: string): string | undefined {
  return libraryAdds.get(jobId)
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

function replaceAsset(asset: Asset): void {
  const layout = editor.history.present
  const assets = layout.assets.map((entry) => (entry.id === asset.id ? asset : entry))
  setHistory(commit(editor.history, { ...layout, assets }, currentLabel()), 'none')
}

function unknownAsset(assetId: string) {
  return { ok: false, reason: 'unknown-asset', message: `there is no asset ${assetId}` } as const
}

function setAssetLabels(assetId: string, labels: string[]): ReturnType<RoomfitEditorApi['setAssetLabels']> {
  const asset = editor.history.present.assets.find(({ id }) => id === assetId)
  if (!asset) return unknownAsset(assetId)
  const parsed = AssetLabels.safeParse(labels)
  if (!parsed.success) return { ok: false, reason: 'invalid-labels', message: parsed.error.issues[0]?.message ?? 'the labels are invalid' }
  replaceAsset({ ...asset, labels: parsed.data })
  return { ok: true }
}

function setAssetProduct(assetId: string, fields: Parameters<RoomfitEditorApi['setAssetProduct']>[1]): ReturnType<RoomfitEditorApi['setAssetProduct']> {
  const asset = editor.history.present.assets.find(({ id }) => id === assetId)
  if (!asset) return unknownAsset(assetId)
  const product: AssetProduct = { ...asset.product }
  for (const key of ['url', 'brand', 'store'] as const) {
    const value = fields[key]
    if (value === undefined) continue
    const text = filled(value ?? undefined)
    if (text) product[key] = text
    else delete product[key]
  }
  const parsed = AssetProduct.safeParse(product)
  if (!parsed.success) return { ok: false, reason: 'invalid-url', message: parsed.error.issues[0]?.message ?? 'the product link is invalid' }
  replaceAsset({ ...asset, product: parsed.data })
  return { ok: true }
}

/** Why a backend cannot run a job kind (the node classes or model files its ComfyUI lacks), or undefined when it can. */
export function cannotRun(backend: BackendState, kind: JobKind): string | undefined {
  const blocked = backend.unavailable.find((entry) => entry.kind === kind)
  return blocked && `This ComfyUI does not have ${blocked.missing.join(', ')}`
}

type ServerBackend = z.infer<typeof ServerBackend>

let backendChecks = 0
let backendCheck: Promise<unknown> = Promise.resolve()

async function jsonAt(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const response = await fetch(url, init)
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

async function catalogOf(kind: BackendKind): Promise<Catalog | null> {
  return z.record(z.string(), z.unknown()).safeParse(await jsonAt(catalogUrl(kind))).data ?? null
}

async function serverBackend(init?: RequestInit): Promise<ServerBackend> {
  const parsed = ServerBackend.safeParse(await jsonAt(BACKEND_PATH, init))
  if (parsed.success) return parsed.data
  return init ? serverBackend() : { kind: 'local', url: location.origin, localUrl: location.origin, cloudConfigured: false }
}

async function checked({ localUrl, ...server }: ServerBackend): Promise<BackendState> {
  const check = ++backendChecks
  update({ backend: { ...server, status: 'checking', unavailable: [] }, catalog: null, localUrl })
  const catalog = await catalogOf(server.kind)
  const status = catalog ? 'ready' : 'unreachable'
  if (check === backendChecks) update({ backend: { ...server, status, unavailable: [] }, catalog })
  return { ...server, status, unavailable: unavailableJobs(editor.history.present, server.kind, catalog) }
}

function tracked(check: Promise<BackendState>): Promise<BackendState> {
  backendCheck = check.catch(() => undefined)
  return check
}

function checkBackend(): Promise<BackendState> {
  return tracked(serverBackend().then(checked))
}

function setBackend(choice: { kind: BackendKind; url?: string }): Promise<BackendState> {
  return tracked(serverBackend({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(choice) }).then(checked))
}

function workflowChoiceIn({ history, backend, catalog }: Editor, kind: JobKind): WorkflowChoice {
  return workflowChoiceOf(history.present, backend.kind, catalog, kind)
}

function commitGeneration(kind: JobKind, choice: GenerationChoice): void {
  const layout = editor.history.present
  setHistory(commit(editor.history, { ...layout, generation: { ...layout.generation, [kind]: choice } }, currentLabel()), 'none')
}

function setWorkflow(kind: JobKind, id: string): ReturnType<RoomfitEditorApi['setWorkflow']> {
  const owner = workflowKindOf(editor.history.present, id)
  if (owner === undefined) return { ok: false, reason: 'unknown-workflow' }
  if (owner !== kind) return { ok: false, reason: 'wrong-kind' }
  if (editor.history.present.generation?.[kind]?.workflow !== id) commitGeneration(kind, { workflow: id })
  return { ok: true }
}

function setModel(kind: JobKind, key: string, value: string): ReturnType<RoomfitEditorApi['setModel']> {
  const choice = workflowChoiceIn(editor, kind)
  if (!choice.models.some((slot) => slot.key === key)) return { ok: false, reason: 'unknown-slot' }
  const stored = editor.history.present.generation?.[kind]
  commitGeneration(kind, { workflow: choice.current, models: { ...stored?.models, [key]: value } })
  return { ok: true }
}

function refusedWorkflow(message: string, missingTags: string[] = []) {
  return { ok: false, missingTags, message } as const
}

function addCustomWorkflow(kind: JobKind, name: string, graph: unknown): ReturnType<RoomfitEditorApi['addCustomWorkflow']> {
  const parsed = ApiGraph.safeParse(graph)
  if (!parsed.success) return refusedWorkflow('Not an API-format workflow: export it from ComfyUI with "Export (API)"')
  const tags = missingTags(kind, parsed.data)
  if (tags.length > 0) return refusedWorkflow(`Missing tags: ${tags.join(', ')}`, tags)
  const trimmed = name.trim()
  const layout = editor.history.present
  const custom = layout.customWorkflows ?? {}
  if (!trimmed) return refusedWorkflow('The workflow needs a name')
  if (Object.hasOwn(custom, trimmed)) return refusedWorkflow(`There already is a custom workflow called ${trimmed}`)
  if (Object.keys(custom).length >= MAX_CUSTOM_WORKFLOWS) return refusedWorkflow(`A layout holds at most ${MAX_CUSTOM_WORKFLOWS} custom workflows`)
  setHistory(commit(editor.history, { ...layout, customWorkflows: { ...custom, [trimmed]: { kind, graph: parsed.data } } }, currentLabel()), 'none')
  return { ok: true, id: `${CUSTOM_PREFIX}${trimmed}` }
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
  workflowChoice: async (kind) => {
    await backendCheck
    return workflowChoiceIn(editor, kind)
  },
  setWorkflow,
  setModel,
  addCustomWorkflow,
  setRenderStyle,
  setAssetLabels,
  setAssetProduct,
  setLibraryFilter: (label) => update({ libraryFilter: labelInUse(editor.history.present, label) }),
  setHousePlan,
  setSite,
  setBlueprint,
  setBlueprintOpacity: (percent) => update({ blueprintOpacity: Math.min(100, Math.max(0, Math.round(percent))) }),
  exteriorShot,
  renderExterior,
  selectItem: (itemId) => select(editor.history.present.items.some(({ id }) => id === itemId) ? itemId : null),
  setActionLabel: (label) => {
    actionLabel = label
  }
}
