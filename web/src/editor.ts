import type { OrbitControls } from '@react-three/drei'
import type { RootState } from '@react-three/fiber'
import type { ComponentRef } from 'react'
import { Box3, type Object3D, type Scene } from 'three'

import { collisions, outOfBounds } from '../../packages/placement/src/index.ts'
import { parseLayout, type RoomLayout } from '../../packages/schema/src/index.ts'
import type { EditorState, RoomfitEditorApi, SceneItem } from '../../spec/contracts/editor-api.ts'
import * as edits from './edits.ts'
import { amend, commit, fresh, redo, undo, type History } from './history.ts'
import { loadMesh } from './meshes.ts'
import { exportPasses } from './passes.ts'

type Gesture = 'none' | 'started' | 'editing'
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>
type Size = { width: number; height: number }

const MAX_PASS_SIZE = 8192

export type Editor = {
  history: History<RoomLayout>
  selectedId: string | null
  meshes: ReadonlyMap<string, Object3D | null>
  gesture: Gesture
  revision: number
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

let editor: Editor = { history: fresh(emptyLayout), selectedId: null, meshes: new Map(), gesture: 'none', revision: 0 }
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
  for (const { uri } of layout.assets) {
    void loadMesh(uri).then((mesh) => {
      if (!editor.meshes.has(uri)) update({ meshes: new Map(editor.meshes).set(uri, mesh) })
    })
  }
}

function nextFrame(): Promise<number> {
  return new Promise(requestAnimationFrame)
}

async function rendered(): Promise<RootState> {
  await threeReady
  await Promise.all(editor.history.present.assets.map(({ uri }) => loadMesh(uri)))
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
    canRedo: history.future.length > 0
  }
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
  }
}
