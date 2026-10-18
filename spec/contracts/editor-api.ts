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
  outOfBounds: { itemId: string; reason: 'outside-room' | 'hits-wall' | 'above-ceiling' }[]
  canUndo: boolean
  canRedo: boolean
  jobs: ComfyJob[]
  lastRender: string | null
  view: EditorView
  scene: ScenePreset
}

export type RenderPasses = { depth: string; normal: string; mask: string }

export type ComfyJobStatus = 'uploading' | 'queued' | 'in_progress' | 'downloading' | 'fitting' | 'done' | 'failed'

export type ComfyJob = { kind: 'product' | 'render'; status: ComfyJobStatus; message?: string }

export type ComfyFailure = { ok: false; reason: 'unreachable' | 'http' | 'rejected' | 'failed' | 'cancelled' | 'unreadable'; message: string }

export type ProductRequest = {
  fileName: string
  imageBase64: string
  name: string
  dimensions: { width: number; depth: number; height: number }
  mode?: 'exact' | 'uniform' | 'auto'
  seed?: number
}

export type EditorView = 'editor' | 'studio'

export type ScenePreset = 'reading' | 'work' | 'movie' | 'evening'

export type Lighting = {
  preset: ScenePreset
  sunElevationDeg: number
  sunAzimuthDeg: number
  sunKelvin: number
  sunIntensity: number
  interiorKelvin: number
  interiorIntensity: number
}

export type RenderRequest = { prompt: string; negativePrompt?: string; seed?: number; size?: { width: number; height: number } }

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
  addProductFromPhoto(request: ProductRequest): Promise<{ ok: true; itemId: string; report: { mode: 'exact' | 'uniform'; requested: 'exact' | 'uniform' | 'auto'; yawDegrees: number; distortion: number; flagged: boolean } } | ComfyFailure>
  renderInComfy(request: RenderRequest): Promise<{ ok: true; image: string } | ComfyFailure>
  setView(view: EditorView): void
  setScene(preset: ScenePreset): void
  lighting(): Lighting
  camera(): { position: Vec3; target: Vec3 }
}

declare global {
  interface Window {
    roomfit: RoomfitEditorApi
  }
}
