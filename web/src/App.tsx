import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from 'react'
import { Color, DoubleSide, Mesh, MeshStandardMaterial, Plane, Shape, Vector2, Vector3, type Material, type Object3D } from 'three'

import { collisions, outOfBounds, solidStretches } from '../../packages/placement/src/index.ts'
import {
  AssetLabels,
  FitMode,
  ProductUrl,
  serializeLayout,
  type Asset,
  type BoxRoom,
  type PlacedItem,
  type PlanRoom,
  type Room,
  type RoomLayout,
  type Zone
} from '../../packages/schema/src/index.ts'
import type { Job, JobKind, JobStep } from '../../packages/schema/src/index.ts'
import type { RoomfitEditorApi } from '../../spec/contracts/editor-api.ts'
import {
  api,
  attachControls,
  attachThree,
  beginDrag,
  cannotRun,
  closeRender,
  endDrag,
  isFinished,
  loadUnknown,
  markCommitted,
  select,
  snapshot,
  subscribe,
  wallCutCm
} from './editor.ts'
import { floorTexture } from './floors.ts'
import { meshKey } from './meshes.ts'
import { PanoramaViewer, useEscapeCloses } from './panorama-viewer.tsx'
import { PhotoViewer } from './photo-viewer.tsx'
import { PresetBar, StudioScene, ZoneChips } from './studio.tsx'
import { AssetCard, base64Of, elapsedSeconds, LabelEditor, RoomLabels, selectedAsset, useClock, WorkspaceRail } from './workspace.tsx'

const METERS_TO_CM = 100
const ROTATE_STEP_DEGREES = 15
const floorPlane = new Plane(new Vector3(0, 1, 0), 0)
const emphasisColors = { none: new Color(0x000000), selected: new Color(0x1f4f8f), problem: new Color(0xb3261e) }

const WALL_PLASTER = '#efe4d1'

type Emphasis = keyof typeof emphasisColors

function Bridge({ revision }: { revision: number }) {
  const get = useThree((three) => three.get)
  useEffect(() => attachThree(get), [get])
  useLayoutEffect(() => markCommitted(revision), [revision])
  return null
}

function roomSummary(room: Room): string {
  if (room.kind === 'box') return `${room.width} × ${room.depth} × ${room.height} cm`
  return `${room.zones.map((zone) => zone.name).join(', ')} (walls ${room.wallHeight} cm)`
}

type WallBox = { key: string; center: [number, number, number]; size: [number, number, number]; rotationY: number }

function cutAt(cut: number) {
  return (wall: WallBox): WallBox[] => {
    const bottom = wall.center[1] - wall.size[1] / 2
    const top = Math.min(wall.center[1] + wall.size[1] / 2, cut)
    if (top <= bottom) return []
    return [{ ...wall, center: [wall.center[0], (bottom + top) / 2, wall.center[2]], size: [wall.size[0], top - bottom, wall.size[2]] }]
  }
}

function wallBoxes(room: PlanRoom): WallBox[] {
  return room.walls.flatMap((wall) => {
    const dx = wall.to.x - wall.from.x
    const dz = wall.to.z - wall.from.z
    const length = Math.hypot(dx, dz)
    const rotationY = Math.atan2(-dz, dx)
    const box = (key: string, [start, end]: [number, number], bottom: number, top: number): WallBox => {
      const middle = (start + end) / 2 / length
      return {
        key: `${wall.id}|${key}`,
        center: [wall.from.x + dx * middle, (bottom + top) / 2, wall.from.z + dz * middle],
        size: [end - start, top - bottom, room.wallThickness],
        rotationY
      }
    }
    const halfThickness = room.wallThickness / 2
    const joined = ([start, end]: [number, number]): [number, number] => [start === 0 ? -halfThickness : start, end === length ? length + halfThickness : end]
    const solid = solidStretches(wall, room.openings, ['door', 'window']).map((stretch) => box(`${stretch[0]}`, joined(stretch), 0, room.wallHeight))
    const aroundOpenings = room.openings
      .filter((opening) => opening.wallId === wall.id)
      .flatMap((opening): WallBox[] => {
        const stretch: [number, number] = [opening.offset, opening.offset + opening.width]
        const head = opening.sill + opening.height
        return [
          ...(opening.sill > 0 ? [box(`${opening.offset}|sill`, stretch, 0, opening.sill)] : []),
          ...(head < room.wallHeight ? [box(`${opening.offset}|head`, stretch, head, room.wallHeight)] : [])
        ]
      })
    return [...solid, ...aroundOpenings]
  })
}

function zoneShape(zone: Zone): Shape {
  return new Shape(zone.polygon.map(({ x, z }) => new Vector2(x, -z)))
}

function PlanRoomView({ room, cut }: { room: PlanRoom; cut: number }) {
  const boxes = useMemo(() => wallBoxes(room).flatMap(cutAt(cut)), [room, cut])
  const shapes = useMemo(() => room.zones.map((zone) => ({ zone, shape: zoneShape(zone) })), [room])
  return (
    <group>
      {shapes.map(({ zone, shape }) => (
        <mesh key={zone.id} rotation-x={-Math.PI / 2} receiveShadow>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial map={floorTexture(zone.floor)} roughness={zone.floor === 'tile' ? 0.45 : 0.75} />
        </mesh>
      ))}
      {boxes.map((wall) => (
        <mesh key={wall.key} position={wall.center} rotation-y={wall.rotationY} castShadow receiveShadow>
          <boxGeometry args={wall.size} />
          <meshStandardMaterial color={WALL_PLASTER} roughness={0.95} />
        </mesh>
      ))}
    </group>
  )
}

function RoomView({ room, cut }: { room: Room; cut: number }) {
  return room.kind === 'plan' ? <PlanRoomView room={room} cut={cut} /> : <BoxRoomView room={room} />
}

function BoxRoomView({ room }: { room: BoxRoom }) {
  const walls: { position: [number, number, number]; rotationY: number; length: number }[] = [
    { position: [0, room.height / 2, -room.depth / 2], rotationY: 0, length: room.width },
    { position: [0, room.height / 2, room.depth / 2], rotationY: Math.PI, length: room.width },
    { position: [-room.width / 2, room.height / 2, 0], rotationY: Math.PI / 2, length: room.depth },
    { position: [room.width / 2, room.height / 2, 0], rotationY: -Math.PI / 2, length: room.depth }
  ]
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial color="#cfc8bc" />
      </mesh>
      {walls.map((wall) => (
        <mesh key={wall.rotationY} position={wall.position} rotation-y={wall.rotationY}>
          <planeGeometry args={[wall.length, room.height]} />
          <meshStandardMaterial color="#ece8e1" />
        </mesh>
      ))}
    </group>
  )
}

function doubleSidedCopy(material: Material): Material {
  const copy = material.clone()
  copy.side = DoubleSide
  return copy
}

function itemModel(source: Object3D): Object3D {
  const copy = source.clone()
  copy.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.castShadow = object.receiveShadow = true
    if (!object.geometry.hasAttribute('normal')) object.geometry.computeVertexNormals()
    object.material = Array.isArray(object.material) ? object.material.map(doubleSidedCopy) : doubleSidedCopy(object.material)
  })
  return copy
}

function paint(model: Object3D, emphasis: Emphasis): void {
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return
    for (const material of [object.material].flat()) {
      if (material instanceof MeshStandardMaterial) material.emissive.copy(emphasisColors[emphasis])
    }
  })
}

type ItemProps = { item: PlacedItem; asset: Asset; mesh: Object3D | null | undefined; emphasis: Emphasis }

function Item({ item, asset, mesh, emphasis }: ItemProps) {
  const model = useMemo(() => (mesh ? itemModel(mesh) : null), [mesh])
  const grabOffset = useRef({ x: 0, z: 0 })
  const { width, depth, height } = asset.dimensions

  useEffect(() => {
    if (model) paint(model, emphasis)
  }, [model, emphasis])

  const floorPoint = (event: ThreeEvent<PointerEvent>) => event.ray.intersectPlane(floorPlane, new Vector3())

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const point = floorPoint(event)
    if (!point) return
    ;(event.target as Element).setPointerCapture(event.pointerId)
    grabOffset.current = { x: point.x - item.position.x, z: point.z - item.position.z }
    beginDrag(item.id)
  }

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (snapshot().gesture === 'none' || snapshot().selectedId !== item.id) return
    const point = floorPoint(event)
    if (point) api.moveItem(item.id, { x: point.x - grabOffset.current.x, z: point.z - grabOffset.current.z })
  }

  return (
    <group
      position={[item.position.x, item.position.y, item.position.z]}
      rotation-y={(item.rotationY * Math.PI) / 180}
      userData={{ itemId: item.id, meshLoaded: model !== null, highlighted: emphasis === 'problem' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    >
      {model ? (
        <primitive object={model} scale={METERS_TO_CM} />
      ) : (
        <mesh position-y={height / 2} castShadow receiveShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color="#8d9399" emissive={emphasisColors[emphasis]} />
        </mesh>
      )}
    </group>
  )
}

function rotateSelected(direction: 1 | -1): void {
  const { history, selectedId } = snapshot()
  const item = history.present.items.find(({ id }) => id === selectedId)
  if (item) api.rotateItem(item.id, item.rotationY + direction * ROTATE_STEP_DEGREES)
}

function removeSelected(): void {
  const { selectedId } = snapshot()
  if (selectedId) api.removeItem(selectedId)
}

function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault()
        return event.shiftKey ? api.redo() : api.undo()
      }
      if (key === 'delete' || key === 'backspace') return removeSelected()
      if (key === 'q') return rotateSelected(1)
      if (key === 'e') return rotateSelected(-1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

function download(): void {
  const layout = api.save()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([serializeLayout(layout)], { type: 'application/json' }))
  link.download = `${layout.id}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

function Panel({ hidden }: { hidden: boolean }) {
  const editor = useSyncExternalStore(subscribe, snapshot)
  const [loadIssues, setLoadIssues] = useState<string[]>([])
  const { collisions: collidingPairs, outOfBounds: escapes, canUndo, canRedo, selectedId, layout } = useMemo(() => api.state(), [editor])
  const selected = selectedAsset(layout, selectedId)

  const open = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const issues = await parseAndLoad(await file.text())
    setLoadIssues(issues)
  }

  return (
    <aside hidden={hidden}>
      <Field label="Open layout">
        <input type="file" accept=".json,application/json" onChange={open} />
      </Field>
      <div className="button-row">
        <button onClick={download}>Save</button>
        <button onClick={api.undo} disabled={!canUndo}>Undo</button>
        <button onClick={api.redo} disabled={!canRedo}>Redo</button>
      </div>
      {loadIssues.map((issue) => (
        <div key={issue} className="problem">{issue}</div>
      ))}
      <h2>Room</h2>
      <div>{layout.name}: {roomSummary(layout.room)}</div>
      <section aria-label="Selected">
        <h2>Selected</h2>
        {selectedId ? (
          <>
            {selected && (
              <div className="asset">
                <AssetCard asset={selected} />
              </div>
            )}
            <div className="button-row">
              <div className="selected-id">{selectedId}</div>
              <button onClick={() => rotateSelected(1)}>Rotate ⟲ (Q)</button>
              <button onClick={() => rotateSelected(-1)}>Rotate ⟳ (E)</button>
              <button onClick={removeSelected}>Remove (Del)</button>
            </div>
          </>
        ) : (
          <div>Click an item, drag it on the floor.</div>
        )}
      </section>
      <h2>Problems</h2>
      {collidingPairs.map(({ a, b }) => (
        <div key={`${a}|${b}`} className="problem">{a} collides with {b}</div>
      ))}
      {escapes.map(({ itemId, reason }) => (
        <div key={`${itemId}|${reason}`} className="problem">{itemId}: {reason}</div>
      ))}
      {collidingPairs.length + escapes.length === 0 && <div>None</div>}
      <ComfyPanel />
    </aside>
  )
}

const SIZE_FIELDS = [
  ['width', 'Width (cm)'],
  ['depth', 'Depth (cm)'],
  ['height', 'Height (cm)']
] as const

type SizeInput = Record<(typeof SIZE_FIELDS)[number][0], string>

const STEP_LABELS: Record<JobKind, Partial<Record<JobStep, string>>> = {
  product: {
    uploading: 'Uploading photo',
    queued: 'Queued on ComfyUI',
    generating: 'Generating 3D on ComfyUI',
    downloading: 'Downloading the model'
  },
  render: {
    uploading: 'Uploading depth pass',
    queued: 'Queued on ComfyUI',
    generating: 'Rendering on ComfyUI',
    downloading: 'Downloading the render'
  },
  photo3d: {},
  pano360: {
    uploading: 'Uploading depth panorama',
    queued: 'Queued on ComfyUI',
    generating: 'Generating the 360° view on ComfyUI',
    downloading: 'Downloading the 360° view'
  }
}

type FitSummary = Extract<Awaited<ReturnType<RoomfitEditorApi['addProductFromPhoto']>>, { ok: true }>['report']

function placedLine(fit: FitSummary | null): string {
  if (!fit) return 'Placed'
  const modes = fit.requested === fit.mode ? fit.mode : `${fit.requested} → ${fit.mode}`
  const flag = fit.flagged ? ' (flagged)' : ''
  return `Placed — ${modes}, turned ${Math.round(fit.yawDegrees)}°, distortion ${fit.distortion.toFixed(2)}${flag}`
}

function fittingStep(size: SizeInput): string {
  const listed = SIZE_FIELDS.map(([axis]) => size[axis])
  return listed.every(Boolean) ? `Fitting to ${listed.join(' × ')} cm` : 'Fitting to the listed size'
}

function statusLine(job: Job | undefined, fit: FitSummary | null, size: SizeInput, seconds: number): string {
  if (!job) return 'Ready'
  const status = job.steps.at(-1)?.status ?? 'queued'
  if (status === 'failed') return `Failed: ${job.message ?? 'unknown error'}`
  if (status === 'done') return job.kind === 'product' ? placedLine(fit) : `Rendered in ${seconds} s`
  const step = status === 'fitting' ? fittingStep(size) : `${STEP_LABELS[job.kind][status] ?? status}…`
  return `${step} ${seconds} s`
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function OpenedRender({ studio }: { studio: boolean }) {
  const { openedRender, jobs, backend } = useSyncExternalStore(subscribe, snapshot)
  useEscapeCloses(openedRender ? closeRender : null)
  if (!openedRender) return null
  const renderJob = jobs.find(({ kind, result }) => kind === 'render' && result?.image === openedRender.image)
  const viewAs3d = renderJob && !cannotRun(backend, 'photo3d') ? () => void api.photo3d({ kind: 'render', jobId: renderJob.id }) : undefined
  return <RenderOverlay image={openedRender.image} prompt={openedRender.caption} studio={studio} onClose={closeRender} onViewAs3d={viewAs3d} />
}

type RenderOverlayProps = { image: string; prompt: string; studio: boolean; onClose: () => void; onViewAs3d: (() => void) | undefined }

function RenderOverlay({ image, prompt, studio, onClose, onViewAs3d }: RenderOverlayProps) {
  return (
    <div className={studio ? 'render-overlay studio-render' : 'render-overlay'}>
      <figure>
        <img src={image} alt="Render result" />
        {prompt && <figcaption>{prompt}</figcaption>}
      </figure>
      <div className="button-row">
        {onViewAs3d && <button onClick={onViewAs3d}>View as 3D photo</button>}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

function ComfyPanel() {
  const { jobs, backend } = useSyncExternalStore(subscribe, snapshot)
  const noProduct = cannotRun(backend, 'product')
  const noRender = cannotRun(backend, 'render')
  const [photo, setPhoto] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [size, setSize] = useState<SizeInput>({ width: '', depth: '', height: '' })
  const [mode, setMode] = useState<FitMode>('auto')
  const [link, setLink] = useState('')
  const [brand, setBrand] = useState('')
  const [store, setStore] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [place, setPlace] = useState(true)
  const [placedFit, setPlacedFit] = useState<FitSummary | null>(null)
  const linkProblem = link.trim() ? ProductUrl.safeParse(link.trim()).error?.issues[0]?.message : undefined
  const [prompt, setPrompt] = useState('')
  const job = jobs.at(-1)
  const now = useClock(job !== undefined && !isFinished(job))
  const seconds = job ? elapsedSeconds(job, now) : 0

  const render = () => api.renderInComfy({ prompt })

  const generate3d = async () => {
    if (!photo) return
    const dimensions = { width: Number(size.width), depth: Number(size.depth), height: Number(size.height) }
    setPlacedFit(null)
    const placed = await api.addProductFromPhoto({ fileName: photo.name, imageBase64: await base64Of(photo), name, dimensions, mode, productUrl: link, brand, store, labels, place })
    if (placed.ok) setPlacedFit(placed.report)
  }

  const relabel = (next: string[]) => {
    const parsed = AssetLabels.safeParse(next)
    if (!parsed.success) return parsed.error.issues[0]?.message ?? 'the labels are invalid'
    setLabels(parsed.data)
  }

  return (
    <>
      <h2>Product from photo</h2>
      <Field label="Product photo">
        <input type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
      </Field>
      <Field label="Product name">
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <div className="size-row">
        {SIZE_FIELDS.map(([axis, label]) => (
          <Field key={axis} label={label}>
            <input type="number" min="1" value={size[axis]} onChange={(event) => setSize({ ...size, [axis]: event.target.value })} />
          </Field>
        ))}
      </div>
      <Field label="Fit mode">
        <select value={mode} onChange={(event) => setMode(FitMode.catch('auto').parse(event.target.value))}>
          <option value="auto">auto</option>
          <option value="exact">exact</option>
          <option value="uniform">uniform</option>
        </select>
      </Field>
      <Field label="Product link">
        <input type="url" placeholder="https://" value={link} onChange={(event) => setLink(event.target.value)} />
      </Field>
      {linkProblem && <div className="problem">{linkProblem}</div>}
      <Field label="Brand">
        <input value={brand} onChange={(event) => setBrand(event.target.value)} />
      </Field>
      <Field label="Store">
        <input value={store} onChange={(event) => setStore(event.target.value)} />
      </Field>
      <div className="field">
        <span>Labels</span>
        <LabelEditor labels={labels} field="Labels" onChange={relabel} />
      </div>
      <label className="check">
        <input type="checkbox" checked={place} onChange={(event) => setPlace(event.target.checked)} /> Place in the house
      </label>
      <button className="primary" onClick={generate3d} disabled={!photo || noProduct !== undefined || linkProblem !== undefined} title={noProduct ?? linkProblem}>Generate 3D</button>
      <h2>Render</h2>
      <Field label="Render prompt">
        <textarea rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </Field>
      <button className="primary" onClick={render} disabled={!prompt.trim() || noRender !== undefined} title={noRender}>Render</button>
      <div role="status" className={job?.steps.at(-1)?.status === 'failed' ? 'status problem' : 'status'}>
        {statusLine(job, placedFit, size, seconds)}
      </div>
    </>
  )
}

async function parseAndLoad(text: string): Promise<string[]> {
  try {
    const loaded = await loadUnknown(JSON.parse(text))
    return loaded.ok ? [] : loaded.issues.map(({ path, message }) => `${path || '(root)'}: ${message}`)
  } catch {
    return ['The file is not valid JSON.']
  }
}

function SelectedItem({ asset }: { asset: Asset | undefined }) {
  if (!asset) return null
  return (
    <section aria-label="Selected item" className="selected-item asset">
      <AssetCard asset={asset} />
    </section>
  )
}

function emphasisOf(id: string, problems: ReadonlySet<string>, selectedId: string | null): Emphasis {
  if (problems.has(id)) return 'problem'
  return id === selectedId ? 'selected' : 'none'
}

export function App() {
  const editor = useSyncExternalStore(subscribe, snapshot)
  const layout = editor.history.present
  const assets = useMemo(() => new Map(layout.assets.map((asset) => [asset.id, asset])), [layout.assets])
  const problems = useMemo(
    () => new Set([...collisions(layout).flatMap(({ a, b }) => [a, b]), ...outOfBounds(layout).map(({ itemId }) => itemId)]),
    [layout]
  )
  const studio = editor.view === 'studio'
  const [railOpen, setRailOpen] = useState(true)
  useKeyboardShortcuts()

  return (
    <>
      <main className={studio ? 'viewport studio' : 'viewport'}>
        <Canvas shadows="percentage" camera={{ fov: 50, near: 1, far: 20000, position: [0, 450, 550] }} onPointerMissed={() => select(null)}>
          <Bridge revision={editor.revision} />
          {studio ? (
            <StudioScene room={layout.room} />
          ) : (
            <>
              <hemisphereLight args={['#ffffff', '#8a8178', 1.2]} />
              <directionalLight position={[200, 400, 300]} intensity={1.5} />
            </>
          )}
          <OrbitControls makeDefault ref={attachControls} maxPolarAngle={studio ? Math.PI * 0.45 : Math.PI} />
          <RoomView room={layout.room} cut={wallCutCm(editor)} />
          {layout.items.map((item) => {
            const asset = assets.get(item.assetId)
            return asset ? (
              <Item
                key={item.id}
                item={item}
                asset={asset}
                mesh={editor.meshes.get(meshKey(asset))}
                emphasis={emphasisOf(item.id, problems, editor.selectedId)}
              />
            ) : null
          })}
          <RoomLabels />
        </Canvas>
        {studio && <ZoneChips room={layout.room} />}
        {studio && <PresetBar room={layout.room} />}
        {studio && <SelectedItem asset={selectedAsset(layout, editor.selectedId)} />}
        <div className="view-toggles">
          <button aria-pressed={railOpen} onClick={() => setRailOpen(!railOpen)}>Workspace</button>
          <button onClick={() => api.setView(studio ? 'editor' : 'studio')}>{studio ? 'Editor' : 'Studio'}</button>
        </div>
      </main>
      <Panel hidden={studio} />
      {railOpen && <WorkspaceRail />}
      <OpenedRender studio={studio} />
      <PhotoViewer />
      <PanoramaViewer />
    </>
  )
}
