import type { FitMode } from './layout.ts'

/** Why a placed item is not allowed where it stands. */
export type OutOfBoundsReason = 'outside-room' | 'hits-wall' | 'above-ceiling'

/** A pair of placed items whose footprints overlap, `a < b` by id. */
export type Collision = { a: string; b: string }

/** The fit mode actually applied after `auto` has been resolved. */
export type AppliedFitMode = Exclude<FitMode, 'auto'>

/** What fitting a mesh to its listed size did. */
export type FitReport = {
  mode: AppliedFitMode
  requested: FitMode
  scale: { x: number; y: number; z: number }
  yawDegrees: number
  distortion: number
  flagged: boolean
}

/** Where a new item of a given size can stand in a zone: back against a wall, front (+Z) facing the room. */
export type FindSpotOutcome =
  | { ok: true; position: { x: number; y: number; z: number }; rotationY: number; wallId: string }
  | { ok: false; reason: 'unknown-zone' | 'no-space' }

/** Kinds of ComfyUI work the editor runs. */
export type JobKind = 'product' | 'render' | 'photo3d' | 'pano360'

/** Steps a ComfyUI job goes through, in order; it ends in `done` or `failed`. */
export type JobStep = 'uploading' | 'queued' | 'generating' | 'downloading' | 'fitting' | 'meshing' | 'done' | 'failed'

/** Source image for a 3D photo: a finished render job or an uploaded photo. */
export type Photo3dSource = { kind: 'render'; jobId: string } | { kind: 'upload'; fileName: string; imageBase64: string }

/** One ComfyUI job as the editor tracks it. */
export type Job = {
  id: string
  kind: JobKind
  title: string
  steps: { status: JobStep; at: number }[]
  message?: string
  result?: { image?: string; glb?: string; itemId?: string }
}

/** At most this many jobs run at once; more wait as `queued`. */
export const MAX_CONCURRENT_JOBS = 3

/** Expected seconds before any job of a kind has finished in this session. */
export const DEFAULT_EXPECTED_SECONDS: Record<JobKind, number> = { product: 60, render: 15, photo3d: 30, pano360: 60 }
