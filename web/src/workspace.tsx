import { Html } from '@react-three/drei'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, KeyboardEvent, ReactNode, SyntheticEvent } from 'react'

import { expectedSeconds } from '../../packages/comfy/src/index.ts'
import { itemsInZone, zoneAt } from '../../packages/placement/src/index.ts'
import type { Asset, BackendKind, Job, JobKind, Room, RoomLayout, Zone } from '../../packages/schema/src/index.ts'
import type { BackendState, JobWorkflow, WorkflowChoice, WorkflowOption } from '../../spec/contracts/editor-api.ts'
import {
  api,
  cannotRun,
  clearFinishedJobs,
  dataUrlOf,
  hasLabel,
  isFinished,
  isStalePanorama,
  labelsInUse,
  libraryAssetOf,
  openRender,
  ranWorkflow,
  select,
  snapshot,
  subscribe
} from './editor.ts'
import { polygonCentroid } from './framing.ts'
import { JOB_KINDS, workflowChoiceOf } from './workflows.ts'

const CLOCK_TICK_MS = 250
const ACTION_LABELS = { product: 'Show', render: 'Open', photo3d: 'Open', pano360: 'Open' } as const

export async function base64Of(file: Blob): Promise<string> {
  return (await dataUrlOf(file)).split(',')[1] ?? ''
}

export function useClock(running: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running) return
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick)
    const timer = setInterval(tick, CLOCK_TICK_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [running])
  return now
}

export function elapsedSeconds(job: Job, now: number): number {
  const first = job.steps[0]
  if (!first) return 0
  const end = isFinished(job) ? job.steps.at(-1)!.at : now
  return Math.max(0, Math.floor((end - first.at) / 1000))
}

function stopPropagation(event: SyntheticEvent): void {
  event.stopPropagation()
}

function showItem(itemId: string): void {
  const layout = snapshot().history.present
  const item = layout.items.find(({ id }) => id === itemId)
  if (!item) return
  api.focusZone(zoneAt(layout, item.position))
  select(item.id)
}

function placeFromLibrary(assetId: string): void {
  const placed = api.placeAsset(assetId)
  if (placed.ok) showItem(placed.itemId)
}

function actionLabel(job: Job): string {
  return libraryAssetOf(job.id) ? 'Place in' : ACTION_LABELS[job.kind]
}

function runAction(job: Job): void {
  const { image, itemId } = job.result ?? {}
  const assetId = libraryAssetOf(job.id)
  if (job.kind === 'product' && assetId) return placeFromLibrary(assetId)
  if (job.kind === 'product' && itemId) return showItem(itemId)
  if (job.kind === 'render' && image) return openRender(image, job.title)
  if (job.kind === 'photo3d') api.openPhoto3d(job.id)
  if (job.kind === 'pano360') api.open360(job.id)
}

const BACKEND_NAMES: Record<BackendKind, string> = { local: 'Local', cloud: 'Cloud' }

function backendLabel({ kind, status, unavailable }: BackendState): string {
  const count = unavailable.length
  const detail = status !== 'ready' ? status : count === 0 ? 'ready' : `${count} ${count === 1 ? 'workflow' : 'workflows'} unavailable`
  return `${BACKEND_NAMES[kind]} · ${detail}`
}

/** Calls `close` when Escape is pressed anywhere; pass null while there is nothing to close. */
export function useEscapeCloses(close: (() => void) | null): void {
  useEffect(() => {
    if (!close) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])
}

function BackendChip() {
  const { backend, localUrl } = useSyncExternalStore(subscribe, snapshot)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(localUrl)
  const container = useRef<HTMLDivElement>(null)
  const [shownLocalUrl, setShownLocalUrl] = useState(localUrl)
  if (shownLocalUrl !== localUrl) {
    setShownLocalUrl(localUrl)
    setUrl(localUrl)
  }
  const close = useCallback(() => setOpen(false), [])
  useEscapeCloses(open ? close : null)
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => event.target instanceof Node && !container.current?.contains(event.target) && close()
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, close])
  const use = (choice: Parameters<typeof api.setBackend>[0]) => {
    close()
    void api.setBackend(choice)
  }
  return (
    <div className="backend" ref={container}>
      <button className={`backend-chip ${backend.status}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {backendLabel(backend)}
      </button>
      {open && (
        <div role="group" aria-label="ComfyUI backend" className="place-menu backend-menu">
          <button
            disabled={!backend.cloudConfigured}
            title={backend.cloudConfigured ? 'Run new jobs on Comfy Cloud' : 'No Cloud key in .env.local'}
            onClick={() => use({ kind: 'cloud' })}
          >
            Use Cloud
          </button>
          <button onClick={() => use({ kind: 'local', url: url.trim() })}>Use Local</button>
          <label className="field">
            <span>Local ComfyUI URL</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <button onClick={() => void api.checkBackend()}>Check again</button>
          {backend.unavailable.map(({ kind, missing }) => (
            <div key={kind} className="problem">{`${kind}: needs ${missing.join(', ')}`}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function fileNameOf(path: string): string {
  return path.split('/').at(-1) ?? path
}

function filledInputs(prompt: JobWorkflow['submitted']): [string, string][] {
  return Object.values(prompt).flatMap(({ _meta, inputs }) =>
    _meta?.title?.startsWith('roomfit:')
      ? Object.entries(inputs)
          .filter(([, value]) => !Array.isArray(value))
          .map(([name, value]): [string, string] => [`${_meta.title} · ${name}`, String(value)])
      : []
  )
}

function WorkflowDialog({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [notice, setNotice] = useState('')
  const ran = ranWorkflow(jobId)
  if (!ran) return null
  const json = JSON.stringify(ran.submitted, null, 2)

  const download = () => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    link.download = fileNameOf(ran.file)
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const openInComfy = () => {
    window.open(new URL('/', ran.url).href, '_blank', 'noopener')
    navigator.clipboard.writeText(json).then(
      () => setNotice('Paste into ComfyUI (Ctrl+V)'),
      () => setNotice('Copy failed: use Download JSON and drop the file into ComfyUI')
    )
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Workflow" className="workflow-dialog" onKeyDown={(event) => event.key === 'Escape' && onClose()}>
      <div>
        <header>
          <h2>Workflow</h2>
          <div>
            <strong>{ran.file}</strong> <span className="muted">on {BACKEND_NAMES[ran.backend]}</span>
          </div>
        </header>
        <div className="workflow-body">
          <table aria-label="Nodes">
            <thead>
              <tr><th>Node</th><th>Class</th></tr>
            </thead>
            <tbody>
              {Object.entries(ran.submitted).map(([id, node]) => (
                <tr key={id}><td>{node._meta?.title ?? id}</td><td>{node.class_type}</td></tr>
              ))}
            </tbody>
          </table>
          <table aria-label="Inputs roomfit filled">
            <tbody>
              {filledInputs(ran.submitted).map(([name, value]) => (
                <tr key={name}><th>{name}</th><td>{value}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {notice && <div role="status">{notice}</div>}
        <div className="button-row">
          <button onClick={download}>Download JSON</button>
          <button onClick={openInComfy}>Open in ComfyUI</button>
          <button onClick={onClose} autoFocus>Close</button>
        </div>
      </div>
    </div>
  )
}

function JobCard({ job, jobs, now }: { job: Job; jobs: readonly Job[]; now: number }) {
  const { backend } = useSyncExternalStore(subscribe, snapshot)
  const [showWorkflow, setShowWorkflow] = useState(false)
  const step = job.steps.at(-1)?.status ?? 'queued'
  const finished = isFinished(job)
  const image = job.result?.image
  const noPhoto3d = cannotRun(backend, 'photo3d')
  return (
    <article aria-label={job.title} className={`job ${step}`}>
      <header>
        <span aria-hidden="true">{step === 'failed' ? '✕' : finished ? '✓' : '◐'}</span> {job.title}
      </header>
      <div className="job-step">
        {step} {finished ? `${elapsedSeconds(job, now)} s` : `${elapsedSeconds(job, now)} s / ~${Math.round(expectedSeconds(jobs, job.kind))} s`}
      </div>
      {!finished && <progress aria-label={`${job.title} running`} />}
      {step === 'failed' && (
        <>
          <div className="problem">{job.message}</div>
          <div className="button-row">
            <button onClick={() => void api.retryJob(job.id)}>Retry</button>
          </div>
        </>
      )}
      {step === 'done' && (
        <div className="job-result">
          {image && <img src={image} alt={job.title} />}
          {job.kind === 'pano360' && isStalePanorama(job.id) && <div className="problem">Layout changed since this view</div>}
          <div className="button-row">
            <button onClick={() => runAction(job)}>{actionLabel(job)}</button>
            {job.kind === 'render' && (
              <button disabled={noPhoto3d !== undefined} title={noPhoto3d} onClick={() => void api.photo3d({ kind: 'render', jobId: job.id })}>
                View as 3D photo
              </button>
            )}
            {job.kind === 'pano360' && <button onClick={() => void api.retryJob(job.id)}>Regenerate</button>}
          </div>
        </div>
      )}
      <div className="button-row">
        <button onClick={() => setShowWorkflow(true)}>Workflow</button>
      </div>
      {showWorkflow && <WorkflowDialog jobId={job.id} onClose={() => setShowWorkflow(false)} />}
    </article>
  )
}

function JobsSection() {
  const { jobs } = useSyncExternalStore(subscribe, snapshot)
  const running = jobs.filter((job) => !isFinished(job)).length
  const now = useClock(running > 0)
  return (
    <section aria-label="Jobs" className="rail-section">
      <h2>Jobs{running > 0 && ` (${running} running)`}</h2>
      {jobs.length === 0 && <div className="muted">No jobs yet. Generate a product or render a room.</div>}
      {[...jobs].reverse().map((job) => (
        <JobCard key={job.id} job={job} jobs={jobs} now={now} />
      ))}
      {jobs.length > running && <button onClick={clearFinishedJobs}>Clear finished</button>}
    </section>
  )
}

type Target = { id: string | undefined; name: string }

function placeTargets(room: Room, focusedZone: string | null): Target[] {
  if (room.kind !== 'plan') return [{ id: undefined, name: 'Room' }]
  return [...room.zones].sort((a, b) => Number(b.id === focusedZone) - Number(a.id === focusedZone))
}

function sourceLabel(asset: Asset): string {
  return asset.source.kind === 'generated' ? 'Cloud' : 'Upload'
}

function storeLine({ product }: Asset): string | undefined {
  if (product?.generatedPhoto) return 'AI-generated photo · no store'
  return [product?.brand, product?.store].filter(Boolean).join(' · ') || undefined
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}

type LabelEditorProps = { labels: readonly string[]; field: string; onChange: (labels: string[]) => string | undefined; onClose?: () => void }

/** Label chips with a remove button each and a field that adds the typed label on Enter or comma, suggesting labels in use. */
export function LabelEditor({ labels, field, onChange, onClose }: LabelEditorProps) {
  const { history } = useSyncExternalStore(subscribe, snapshot)
  const [text, setText] = useState('')
  const [problem, setProblem] = useState('')
  const suggestions = useId()

  const change = (next: string[]) => {
    const refused = onChange(next)
    setProblem(refused ?? '')
    return refused === undefined
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') onClose?.()
    if (event.key !== 'Enter' && event.key !== ',') return
    event.preventDefault()
    if (text.trim() && change([...labels, text.trim()])) setText('')
  }

  return (
    <div className="labels">
      {labels.map((label) => (
        <span key={label} className="label-chip">
          {label}
          <button aria-label={`Remove label ${label}`} onClick={() => change(labels.filter((entry) => entry !== label))}>×</button>
        </span>
      ))}
      <input aria-label={field} placeholder={field} list={suggestions} value={text} autoFocus={onClose !== undefined} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} />
      <datalist id={suggestions}>
        {labelsInUse(history.present).map(({ label }) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      {onClose && <button onClick={onClose}>Done</button>}
      {problem && <span className="problem">{problem}</span>}
    </div>
  )
}

function AssetLabelsField({ asset }: { asset: Asset }) {
  const [editing, setEditing] = useState(false)
  const labels = asset.labels ?? []
  const relabel = (next: string[]) => {
    const outcome = api.setAssetLabels(asset.id, next)
    return outcome.ok ? undefined : outcome.message
  }
  if (editing) return <LabelEditor labels={labels} field="Add label" onChange={relabel} onClose={() => setEditing(false)} />
  return (
    <div className="labels">
      {labels.map((label) => (
        <span key={label} className="label-chip">{label}</span>
      ))}
      <button onClick={() => setEditing(true)}>Edit labels</button>
    </div>
  )
}

/** The asset of the selected item, if an item is selected. */
export function selectedAsset(layout: RoomLayout, selectedId: string | null): Asset | undefined {
  const item = layout.items.find(({ id }) => id === selectedId)
  return item && layout.assets.find(({ id }) => id === item.assetId)
}

/** An asset's product card: photo (or model thumbnail), name, size, brand · store, product link and labels. */
export function AssetCard({ asset, children }: { asset: Asset; children?: ReactNode }) {
  const { thumbnail } = asset
  const photo = asset.product?.photo?.thumbnail
  const url = asset.product?.url
  const store = storeLine(asset)
  const { width, depth, height } = asset.dimensions
  return (
    <>
      {photo ? (
        <img src={photo} alt={`${asset.name} product photo`} />
      ) : thumbnail ? (
        <img src={thumbnail} alt="" />
      ) : (
        <span className="asset-box" aria-hidden="true">▢</span>
      )}
      <div className="asset-text">
        <strong>{asset.name}</strong>
        <span>{`${width} × ${depth} × ${height} cm`}</span>
        <span className="muted">{[sourceLabel(asset), asset.fit?.mode].filter(Boolean).join(' · ')}</span>
        {store && <span className="muted">{store}</span>}
        {url && (
          <span>
            <a href={url} target="_blank" rel="noopener noreferrer">Open product page</a> <span className="muted">{hostOf(url)}</span>
          </span>
        )}
        <AssetLabelsField asset={asset} />
        {children}
      </div>
    </>
  )
}

function AssetRow({ asset, targets }: { asset: Asset; targets: Target[] }) {
  const [choosing, setChoosing] = useState(false)
  const [problem, setProblem] = useState('')

  const place = ({ id, name }: Target) => {
    setChoosing(false)
    const placed = api.placeAsset(asset.id, id)
    if (!placed.ok) return setProblem(placed.reason === 'no-space' ? `No space in ${name}` : `Cannot place: ${placed.reason}`)
    setProblem('')
    if (id) api.focusZone(id)
    select(placed.itemId)
  }

  return (
    <li className="asset">
      <AssetCard asset={asset}>{problem && <span className="problem">{problem}</span>}</AssetCard>
      <div className="place">
        <button aria-haspopup="menu" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}>Place in</button>
        {choosing && (
          <div role="menu" className="place-menu">
            {targets.map((target) => (
              <button key={target.id ?? 'room'} role="menuitem" onClick={() => place(target)}>{target.name}</button>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function withBookmarkletHref(link: HTMLAnchorElement | null): void {
  link?.setAttribute('href', api.bookmarklet())
}

function LibrarySection() {
  const editor = useSyncExternalStore(subscribe, snapshot)
  const { assets, room } = editor.history.present
  const targets = placeTargets(room, editor.focusedZone)
  const noPhoto3d = cannotRun(editor.backend, 'photo3d')
  const filter = editor.libraryFilter
  const shown = filter === null ? assets : assets.filter((asset) => hasLabel(asset, filter))

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await api.photo3d({ kind: 'upload', fileName: file.name, imageBase64: await base64Of(file) })
  }

  return (
    <section aria-label="Library" className="rail-section">
      <h2>Library ({assets.length})</h2>
      {assets.length === 0 && <div className="muted">No assets yet.</div>}
      <label className="field">
        <span>Filter by label</span>
        <select value={filter ?? ''} onChange={(event) => api.setLibraryFilter(event.target.value || null)}>
          <option value="">{`All (${assets.length})`}</option>
          {labelsInUse(editor.history.present).map(({ label, count }) => (
            <option key={label} value={label}>{`${label} (${count})`}</option>
          ))}
        </select>
      </label>
      <ul className="assets">
        {shown.map((asset) => (
          <AssetRow key={asset.id} asset={asset} targets={targets} />
        ))}
      </ul>
      <label className="field">
        <span>Room photo → 3D</span>
        <input type="file" accept="image/*" aria-label="Room photo" onChange={uploadPhoto} disabled={noPhoto3d !== undefined} title={noPhoto3d} />
      </label>
      <div className="muted">The photo is sent to your ComfyUI to build the 3D photo.</div>
      <a ref={withBookmarkletHref} href="#">Send to ComfySims</a>
      <div className="muted">Drag it to your bookmarks bar, then click it on a store's product page to fill in the product here.</div>
    </section>
  )
}

const KIND_NAMES: Record<JobKind, string> = { product: 'Product → 3D', render: 'Room render', photo3d: '3D photo', pano360: '360° view' }

function optionText({ label, available, missing }: WorkflowOption): string {
  return available ? label : `${label} (unavailable: ${missing.join(', ')})`
}

function WorkflowPicker({ choice }: { choice: WorkflowChoice }) {
  const { kind } = choice
  const name = `${KIND_NAMES[kind]} workflow`
  return (
    <div className="workflow-choice">
      <label className="field">
        <span>{name}</span>
        <select aria-label={name} value={choice.current} onChange={(event) => api.setWorkflow(kind, event.target.value)}>
          {choice.options.map((option) => (
            <option key={option.id} value={option.id}>{optionText(option)}</option>
          ))}
        </select>
      </label>
      {choice.models.map((slot) => (
        <label key={slot.key} className="field">
          <span>{slot.label}</span>
          <select aria-label={slot.label} value={slot.value} onChange={(event) => api.setModel(kind, slot.key, event.target.value)}>
            {slot.options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}

function AddWorkflow() {
  const [kind, setKind] = useState<JobKind>('render')
  const [error, setError] = useState<string | null>(null)
  const add = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const graph: unknown = await file.text().then((text) => JSON.parse(text)).catch(() => null)
    const added = api.addCustomWorkflow(kind, file.name.replace(/\.json$/i, ''), graph)
    setError(added.ok ? null : added.message)
  }
  return (
    <div className="workflow-choice">
      <h3>Add workflow</h3>
      <label className="field">
        <span>For</span>
        <select aria-label="For" value={kind} onChange={(event) => setKind(event.target.value as JobKind)}>
          {JOB_KINDS.map((option) => (
            <option key={option} value={option}>{KIND_NAMES[option]}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Workflow JSON</span>
        <input type="file" accept=".json,application/json" aria-label="Workflow JSON" onChange={add} />
      </label>
      {error && <div className="problem">{error}</div>}
    </div>
  )
}

function WorkflowsSection() {
  const { history, backend, catalog } = useSyncExternalStore(subscribe, snapshot)
  const layout = history.present
  const choices = useMemo(() => JOB_KINDS.map((kind) => workflowChoiceOf(layout, backend.kind, catalog, kind)), [layout, backend.kind, catalog])
  return (
    <details className="rail-section">
      <summary>Workflows</summary>
      {choices.map((choice) => (
        <WorkflowPicker key={choice.kind} choice={choice} />
      ))}
      <AddWorkflow />
    </details>
  )
}

/** Right-hand rail with the jobs panel, the asset library and the workflow choices, in both views. */
export function WorkspaceRail() {
  const { agentConnected } = useSyncExternalStore(subscribe, snapshot)
  return (
    <aside className="workspace" aria-label="Workspace">
      <BackendChip />
      {agentConnected && <div className="agent-badge" role="status">Agent connected</div>}
      <JobsSection />
      <LibrarySection />
      <WorkflowsSection />
    </aside>
  )
}

function RoomLabel({ zone, count, dimmed }: { zone: Zone; count: number; dimmed: boolean }) {
  const [editing, setEditing] = useState(false)
  const { x, z } = useMemo(() => polygonCentroid(zone.polygon), [zone.polygon])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') setEditing(false)
    if (event.key === 'Enter' && api.renameZone(zone.id, event.currentTarget.value).ok) setEditing(false)
  }

  return (
    <Html position={[x, 0, z]} center zIndexRange={[5, 0]}>
      {editing ? (
        <input
          className="room-label"
          aria-label="Room name"
          defaultValue={zone.name}
          autoFocus
          onPointerDown={stopPropagation}
          onKeyDown={onKeyDown}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <button
          className={dimmed ? 'room-label dimmed' : 'room-label'}
          onPointerDown={stopPropagation}
          onClick={(event) => {
            event.stopPropagation()
            api.focusZone(zone.id)
          }}
          onDoubleClick={(event) => {
            event.stopPropagation()
            setEditing(true)
          }}
        >
          {`${zone.name} · ${count} ${count === 1 ? 'item' : 'items'}`}
        </button>
      )}
    </Html>
  )
}

/** One floating label per plan room at its centroid: name and item count; click focuses, double-click renames. */
export function RoomLabels() {
  const editor = useSyncExternalStore(subscribe, snapshot)
  const layout = editor.history.present
  if (layout.room.kind !== 'plan') return null
  return layout.room.zones.map((zone) => (
    <RoomLabel
      key={zone.id}
      zone={zone}
      count={itemsInZone(layout, zone.id).length}
      dimmed={editor.focusedZone !== null && editor.focusedZone !== zone.id}
    />
  ))
}
