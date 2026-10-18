import type { OrbitControls } from '@react-three/drei'
import type { RootState } from '@react-three/fiber'
import type { ComponentRef } from 'react'
import { Box3, type Object3D, type Scene } from 'three'

import { buildPhotoTo3dPrompt, buildRenderPrompt, type Failure } from '../../packages/comfy/src/index.ts'
import { fitGlbBytes } from '../../packages/fit/src/index.ts'
import { collisions, outOfBounds, snapPosition } from '../../packages/placement/src/index.ts'
import { Dimensions, parseLayout, type Asset, type PlacedItem, type RoomLayout } from '../../packages/schema/src/index.ts'
import type {
  ComfyFailure,
  ComfyJob,
  EditorState,
  EditorView,
  Lighting,
  ProductRequest,
  RenderRequest,
  RoomfitEditorApi,
  SceneItem,
  ScenePreset
} from '../../spec/contracts/editor-api.ts'
import productWorkflow from '../../workflows/cloud/product-to-glb-pixal3d.json'
import renderWorkflow from '../../workflows/render-from-depth.json'
import { comfyOutputUri, generate, randomSeed } from './comfy.ts'
import * as edits from './edits.ts'
import { amend, commit, fresh, redo, undo, type History } from './history.ts'
import { loadMesh, meshKey } from './meshes.ts'
import { studioCamera } from './framing.ts'
import { exportPasses } from './passes.ts'

type Gesture = 'none' | 'started' | 'editing'
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>
type Size = { width: number; height: number }

const MAX_PASS_SIZE = 8192
const DEFAULT_RENDER_SIZE: Size = { width: 1152, height: 896 }
const PRODUCT_WORKFLOW = 'cloud/product-to-glb-pixal3d'

export type Editor = {
  history: History<RoomLayout>
  selectedId: string | null
  meshes: ReadonlyMap<string, Object3D | null>
  gesture: Gesture
  jobs: readonly ComfyJob[]
  lastRender: string | null
  view: EditorView
  scene: ScenePreset
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
  view: 'editor',
  scene: 'work',
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
  setHistory(commit(editor.history, next), editor.gesture === 'started' ? 'editing' : 'none')
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
  update({ history: fresh(parsed.layout), selectedId: null, gesture: 'none' })
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
    scene: editor.scene
  }
}

function reportJob(job: ComfyJob): void {
  update({ jobs: [...editor.jobs, job] })
}

function rejected(kind: ComfyJob['kind'], message: string): Failure {
  reportJob({ kind, status: 'failed', message })
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

function placeAtRoomCenter(asset: Asset): PlacedItem {
  const layout = editor.history.present
  const item: PlacedItem = {
    id: uniqueId(asset.id, layout.items),
    assetId: asset.id,
    position: snapPosition({ x: 0, y: 0, z: 0 }),
    rotationY: 0
  }
  const next = { ...layout, assets: [...layout.assets, asset], items: [...layout.items, item] }
  setHistory(commit(editor.history, next), 'none')
  requestMeshes(next)
  return item
}

async function addProductFromPhoto(request: ProductRequest): ReturnType<RoomfitEditorApi['addProductFromPhoto']> {
  const mode = request.mode ?? 'exact'
  const name = request.name.trim()
  if (!name) return rejected('product', 'the product needs a name')
  if (!Dimensions.safeParse(request.dimensions).success) return rejected('product', 'width, depth and height must be positive centimeters')

  const photo = await blobAt(`data:application/octet-stream;base64,${request.imageBase64}`)
  const seed = request.seed ?? randomSeed()
  const generated = await generate('product', reportJob, { file: photo, fileName: request.fileName }, (imageName) =>
    buildPhotoTo3dPrompt(productWorkflow, { imageName, seed })
  )
  if (!generated.ok) return generated

  reportJob({ kind: 'product', status: 'fitting' })
  const fitted = await fitGlbBytes(generated.bytes, request.dimensions, mode)
  if (!fitted.ok) {
    const failure: ComfyFailure = { ok: false, reason: 'unreadable', message: `the generated mesh cannot be fitted: ${fitted.reason}` }
    reportJob({ kind: 'product', status: 'failed', message: failure.message })
    return failure
  }
  const { flagged, requested, yawDegrees } = fitted.report
  const distortion = roundedToFloat32Noise(fitted.report.distortion)
  const item = placeAtRoomCenter({
    id: uniqueId(name, editor.history.present.assets),
    name,
    uri: comfyOutputUri(generated.file),
    dimensions: request.dimensions,
    source: { kind: 'generated', workflow: PRODUCT_WORKFLOW },
    fit: { mode, distortion }
  })
  reportJob({ kind: 'product', status: 'done' })
  return { ok: true, itemId: item.id, report: { mode: fitted.report.mode, requested, yawDegrees, distortion, flagged } }
}

async function renderInComfy(request: RenderRequest): ReturnType<RoomfitEditorApi['renderInComfy']> {
  const size = request.size ?? DEFAULT_RENDER_SIZE
  if (!isPassSize(size)) return rejected('render', `the render size must be whole pixels between 1 and ${MAX_PASS_SIZE}`)
  const seed = request.seed ?? randomSeed()
  const depth = await blobAt((await api.exportPasses(size)).depth)
  const generated = await generate('render', reportJob, { file: depth, fileName: 'roomfit-depth.png' }, (depthImageName) =>
    buildRenderPrompt(renderWorkflow, { depthImageName, prompt: request.prompt, negativePrompt: request.negativePrompt ?? '', seed })
  )
  if (!generated.ok) return generated

  const image = URL.createObjectURL(new Blob([new Uint8Array(generated.bytes)], { type: 'image/png' }))
  if (editor.lastRender) URL.revokeObjectURL(editor.lastRender)
  update({ lastRender: image })
  reportJob({ kind: 'render', status: 'done' })
  return { ok: true, image }
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
  setView: (view) => {
    update({ view })
    if (view === 'studio') api.setCamera(studioCamera(editor.history.present.room))
  },
  setScene: (scene) => update({ scene }),
  lighting: () => ({ preset: editor.scene, ...SCENE_LIGHTING[editor.scene] }),
  camera: () => {
    const position = getThree?.().camera.position ?? { x: 0, y: 0, z: 0 }
    const target = controls?.target ?? { x: 0, y: 0, z: 0 }
    return { position: { x: position.x, y: position.y, z: position.z }, target: { x: target.x, y: target.y, z: target.z } }
  }
}
