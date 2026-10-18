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
