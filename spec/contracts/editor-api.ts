import type { RoomLayout } from '../../packages/schema/src/index.ts'

export type Vec3 = { x: number; y: number; z: number }

export type SceneItem = {
  id: string
  worldBoundsCm: { min: Vec3; max: Vec3 }
  highlighted: boolean
  meshLoaded: boolean
}

export type EditorState = {
  layout: RoomLayout
  selectedId: string | null
  collisions: { a: string; b: string }[]
  outOfBounds: { itemId: string; reason: 'outside-room' | 'above-ceiling' }[]
  canUndo: boolean
  canRedo: boolean
}

export type RenderPasses = { depth: string; normal: string; mask: string }

/** The editor's programmatic surface, used by the ComfyUI bridge, e2e tests and agents. Exposed as `window.roomfit`. */
export type RoomfitEditorApi = {
  ready(): Promise<void>
  load(layout: RoomLayout): Promise<{ ok: true } | { ok: false; issues: { path: string; message: string }[] }>
  save(): RoomLayout
  state(): EditorState
  scene(): Promise<SceneItem[]>
  moveItem(id: string, position: { x: number; z: number }): void
  rotateItem(id: string, rotationY: number): void
  removeItem(id: string): void
  undo(): void
  redo(): void
  setCamera(camera: { position: Vec3; target: Vec3 }): void
  exportPasses(size: { width: number; height: number }): Promise<RenderPasses>
}

declare global {
  interface Window {
    roomfit: RoomfitEditorApi
  }
}
