import type { Collision, FitMode, FitReport, Job, OutOfBoundsReason, Photo3dSource, RoomLayout } from '../../packages/schema/src/index.ts'

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
  collisions: Collision[]
  outOfBounds: { itemId: string; reason: OutOfBoundsReason }[]
  canUndo: boolean
  canRedo: boolean
  jobs: Job[]
  lastRender: string | null
  view: EditorView
  scene: ScenePreset
  focusedZone: string | null
  photoViewer: { jobId: string; yawDegrees: number; pitchDegrees: number } | null
  wallCutCm: number
  lastRenderCamera: { position: Vec3; target: Vec3 } | null
}

export type RenderPasses = { depth: string; normal: string; mask: string }

export type ComfyFailure = { ok: false; jobId?: string; reason: 'unreachable' | 'http' | 'rejected' | 'failed' | 'cancelled' | 'unreadable' | 'no-space'; message: string }

export type ProductRequest = {
  fileName: string
  imageBase64: string
  name: string
  dimensions: { width: number; depth: number; height: number }
  mode?: FitMode
  seed?: number
  zoneId?: string
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
  addProductFromPhoto(request: ProductRequest): Promise<{ ok: true; jobId: string; itemId: string; report: Omit<FitReport, 'scale'> } | ComfyFailure>
  renderInComfy(request: RenderRequest): Promise<{ ok: true; jobId: string; image: string } | ComfyFailure>
  setView(view: EditorView): void
  setScene(preset: ScenePreset): void
  lighting(): Lighting
  camera(): { position: Vec3; target: Vec3 }
  focusZone(zoneId: string | null): void
  placeAsset(assetId: string, zoneId?: string): { ok: true; itemId: string } | { ok: false; reason: 'unknown-asset' | 'unknown-zone' | 'no-space' }
  renameZone(zoneId: string, name: string): { ok: true } | { ok: false; reason: 'unknown-zone' | 'empty-name' }
  photo3d(source: Photo3dSource): Promise<{ ok: true; jobId: string; glb: string } | ComfyFailure>
  retryJob(jobId: string): Promise<{ ok: true; jobId: string } | ComfyFailure>
  openPhoto3d(jobId: string): void
  closePhoto3d(): void
}

declare global {
  interface Window {
    roomfit: RoomfitEditorApi
  }
}
