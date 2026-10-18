import { Html } from '@react-three/drei'
import { useEffect, useMemo, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from 'react'

import { expectedSeconds } from '../../packages/comfy/src/index.ts'
import { itemsInZone, zoneAt } from '../../packages/placement/src/index.ts'
import type { Asset, Job, Room, Zone } from '../../packages/schema/src/index.ts'
import { api, clearFinishedJobs, isFinished, isStalePanorama, openRender, select, snapshot, subscribe } from './editor.ts'
import { polygonCentroid } from './framing.ts'
import { meshKey } from './meshes.ts'
import { thumbnailOf } from './thumbnails.ts'

const CLOCK_TICK_MS = 250
const ACTION_LABELS = { product: 'Show', render: 'Open', photo3d: 'Open', pano360: 'Open' } as const

export function base64Of(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function useClock(running: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(timer)
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

function runAction(job: Job): void {
  const { image, itemId } = job.result ?? {}
  if (job.kind === 'product' && itemId) return showItem(itemId)
  if (job.kind === 'render' && image) return openRender(image, job.title)
  if (job.kind === 'photo3d') api.openPhoto3d(job.id)
  if (job.kind === 'pano360') api.open360(job.id)
}

function JobCard({ job, jobs, now }: { job: Job; jobs: readonly Job[]; now: number }) {
  const step = job.steps.at(-1)?.status ?? 'queued'
  const finished = isFinished(job)
  const image = job.result?.image
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
            <button onClick={() => runAction(job)}>{ACTION_LABELS[job.kind]}</button>
            {job.kind === 'render' && <button onClick={() => void api.photo3d({ kind: 'render', jobId: job.id })}>View as 3D photo</button>}
            {job.kind === 'pano360' && <button onClick={() => void api.retryJob(job.id)}>Regenerate</button>}
          </div>
        </div>
      )}
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

function AssetRow({ asset, targets }: { asset: Asset; targets: Target[] }) {
  const { meshes } = useSyncExternalStore(subscribe, snapshot)
  const mesh = meshes.get(meshKey(asset))
  const thumbnail = useMemo(() => (mesh ? thumbnailOf(mesh) : null), [mesh])
  const [choosing, setChoosing] = useState(false)
  const [problem, setProblem] = useState('')
  const { width, depth, height } = asset.dimensions

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
      {thumbnail ? <img src={thumbnail} alt="" /> : <span className="asset-box" aria-hidden="true">▢</span>}
      <div className="asset-text">
        <strong>{asset.name}</strong>
        <span>{`${width} × ${depth} × ${height} cm`}</span>
        <span className="muted">{[sourceLabel(asset), asset.fit?.mode].filter(Boolean).join(' · ')}</span>
        {problem && <span className="problem">{problem}</span>}
      </div>
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

function LibrarySection() {
  const editor = useSyncExternalStore(subscribe, snapshot)
  const { assets, room } = editor.history.present
  const targets = placeTargets(room, editor.focusedZone)

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await api.photo3d({ kind: 'upload', fileName: file.name, imageBase64: await base64Of(file) })
  }

  return (
    <section aria-label="Library" className="rail-section">
      <h2>Library ({assets.length})</h2>
      {assets.length === 0 && <div className="muted">No assets yet.</div>}
      <ul className="assets">
        {assets.map((asset) => (
          <AssetRow key={asset.id} asset={asset} targets={targets} />
        ))}
      </ul>
      <label className="field">
        <span>Room photo → 3D</span>
        <input type="file" accept="image/*" aria-label="Room photo" onChange={uploadPhoto} />
      </label>
      <div className="muted">The photo is sent to your ComfyUI to build the 3D photo.</div>
    </section>
  )
}

/** Right-hand rail with the jobs panel and the asset library, in both views. */
export function WorkspaceRail() {
  const { agentConnected } = useSyncExternalStore(subscribe, snapshot)
  return (
    <aside className="workspace" aria-label="Workspace">
      {agentConnected && <div className="agent-badge" role="status">Agent connected</div>}
      <JobsSection />
      <LibrarySection />
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
