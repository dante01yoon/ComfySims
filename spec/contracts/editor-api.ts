import type { BackendKind, Blueprint, Collision, FitMode, FitReport, Job, JobKind, OutOfBoundsReason, Photo3dSource, PlanRoom, RoomLayout, Site } from '../../packages/schema/src/index.ts'

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
  viewer360: Viewer360 | null
  backend: BackendState
  libraryFilter: string | null
  renderStyle: 'lived-in' | 'as-built'
  pendingImport: ImportedProduct | null
  site: Site
  blueprintOpacity: number
  undoLabels: string[]
  agentConnected: boolean
  wallCutCm: number
  lastRenderCamera: { position: Vec3; target: Vec3 } | null
}

/** The open 360° viewer. Yaw 0 looks at +Z, +90 at +X; pitch is clamped to ±80, field of view to 40–100. */
export type Viewer360 = { jobId: string; zoneId: string; yawDegrees: number; pitchDegrees: number; fovDegrees: number; stale: boolean }

/** An equirectangular depth panorama from a room's standing point: column 0 is yaw −180, the centre column yaw 0 (+Z); row 0 is pitch +90. */
export type DepthPanorama = { image: string; width: number; height: number; standingPoint: { x: number; z: number }; eyeHeightCm: number }

/** The ComfyUI the editor sends new jobs to, and which job kinds it can run (node classes and model files checked against its /api/object_info). */
export type BackendState = {
  kind: BackendKind
  url: string
  status: 'checking' | 'ready' | 'unreachable'
  unavailable: { kind: JobKind; missing: string[] }[]
  cloudConfigured: boolean
}

/** The workflow a job ran: its file under workflows/, the backend, and the exact API graph submitted. */
export type JobWorkflow = { file: string; backend: BackendKind; submitted: Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }> }

export type ExteriorView = 'aerial' | 'street'

/** The camera, roof slab, depth range and tree visibility an exterior shot uses (roof top = wall height + 20 cm over the walls' bounding box). */
export type ExteriorShot = { camera: { position: Vec3; target: Vec3; fovDeg: number; aspect: number }; roof: { topCm: number; min: { x: number; z: number }; max: { x: number; z: number } }; depthRange: { nearCm: number; farCm: number }; trees: boolean }

export type Issues = { path: string; message: string }[]

export type WorkflowOption = { id: string; label: string; source: 'builtin' | 'custom'; available: boolean; missing: string[] }
export type ModelSlot = { key: string; label: string; value: string; options: string[] }
/** The workflow a job kind will use, the alternatives, and the model files it loads. */
export type WorkflowChoice = { kind: JobKind; current: string; options: WorkflowOption[]; models: ModelSlot[] }

/** A product read from a store page by the bookmarklet; sizes in cm, null when the page had none. */
export type ImportedProduct = { url: string; store: string; name: string; brand: string | null; image: string | null; dimensions: { width: number | null; depth: number | null; height: number | null }; model3d: string | null }

export type RenderPasses = { depth: string; normal: string; mask: string }

export type ComfyFailure = { ok: false; jobId?: string; reason: 'unreachable' | 'http' | 'rejected' | 'failed' | 'cancelled' | 'unreadable' | 'no-space'; message: string }

export type ProductRequest = {
  fileName: string
  imageBase64?: string
  imageName?: string
  name: string
  dimensions: { width: number; depth: number; height: number }
  mode?: FitMode
  seed?: number
  zoneId?: string
  productUrl?: string
  brand?: string
  store?: string
  labels?: string[]
  place?: boolean
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
  addProductFromPhoto(request: ProductRequest): Promise<{ ok: true; jobId: string; itemId: string | null; assetId: string; report: Omit<FitReport, 'scale'> } | ComfyFailure>
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
  screenshot(): Promise<string>
  setActionLabel(label: string | null): void
  depthPanorama(zoneId: string): Promise<DepthPanorama | { ok: false; reason: 'unknown-zone' }>
  view360(request?: { zoneId?: string; prompt?: string }): Promise<{ ok: true; jobId: string; image: string } | { ok: false; reason: 'no-room' } | ComfyFailure>
  open360(jobId: string): void
  close360(): void
  backend(): BackendState
  setBackend(choice: { kind: BackendKind; url?: string }): Promise<BackendState>
  checkBackend(): Promise<BackendState>
  jobWorkflow(jobId: string): JobWorkflow | null
  setAssetLabels(assetId: string, labels: string[]): { ok: true } | { ok: false; reason: 'unknown-asset' | 'invalid-labels'; message: string }
  setAssetProduct(assetId: string, fields: { url?: string | null; brand?: string | null; store?: string | null }): { ok: true } | { ok: false; reason: 'unknown-asset' | 'invalid-url'; message: string }
  setLibraryFilter(label: string | null): void
  selectItem(itemId: string | null): void
  setHousePlan(room: PlanRoom): { ok: true; movedToLibrary: string[] } | { ok: false; issues: Issues }
  setSite(site: Site | null): { ok: true } | { ok: false; issues: Issues }
  setBlueprint(blueprint: Blueprint | null): { ok: true } | { ok: false; issues: Issues }
  setBlueprintOpacity(percent: number): void
  exteriorShot(view: ExteriorView): ExteriorShot
  renderExterior(view: ExteriorView): Promise<{ ok: true; jobId: string; image: string } | ComfyFailure>
  workflowChoice(kind: JobKind): Promise<WorkflowChoice>
  setWorkflow(kind: JobKind, id: string): { ok: true } | { ok: false; reason: 'unknown-workflow' | 'wrong-kind' }
  setModel(kind: JobKind, key: string, value: string): { ok: true } | { ok: false; reason: 'unknown-slot' }
  addCustomWorkflow(kind: JobKind, name: string, graph: unknown): { ok: true; id: string } | { ok: false; missingTags: string[]; message: string }
  setRenderStyle(style: 'lived-in' | 'as-built'): void
  bookmarklet(): string
}

declare global {
  interface Window {
    roomfit: RoomfitEditorApi
  }
}
