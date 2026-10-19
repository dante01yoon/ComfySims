import { readFileSync } from 'node:fs'

type Point = { x: number; z: number }
type Wall = { id: string; from: Point; to: Point }
type Opening = { wallId: string; kind: 'door' | 'window'; offset: number; width: number }
type Zone = { name: string; polygon: Point[] }
export type PlanLike = { walls: Wall[]; openings: Opening[]; zones: Zone[] }

export type PlanDiff = {
  walls: { reference: number; candidate: number; maxEndpointErrorCm: number }
  openings: { reference: number; candidate: number; kindMismatches: number; maxCentreErrorCm: number; maxWidthErrorCm: number }
  zones: { reference: number; candidate: number; missing: string[]; maxBoundsErrorCm: number }
}

const segment = ({ from, to }: Wall) => [Math.min(from.x, to.x), Math.min(from.z, to.z), Math.max(from.x, to.x), Math.max(from.z, to.z)]
const segmentError = (a: number[], b: number[]) => Math.max(...a.map((value, i) => Math.abs(value - b[i]!)))
const nearest = <T>(items: T[], distance: (item: T) => number) => items.reduce<{ item: T | undefined; d: number }>((best, item) => (distance(item) < best.d ? { item, d: distance(item) } : best), { item: undefined, d: Infinity })

function openingCentres(plan: PlanLike) {
  const walls = new Map(plan.walls.map((wall) => [wall.id, wall]))
  return plan.openings.flatMap((opening) => {
    const wall = walls.get(opening.wallId)
    if (!wall) return []
    const length = Math.hypot(wall.to.x - wall.from.x, wall.to.z - wall.from.z)
    const along = (opening.offset + opening.width / 2) / length
    return [{ kind: opening.kind, width: opening.width, x: wall.from.x + (wall.to.x - wall.from.x) * along, z: wall.from.z + (wall.to.z - wall.from.z) * along }]
  })
}

const bounds = (polygon: Point[]) => [Math.min(...polygon.map((p) => p.x)), Math.min(...polygon.map((p) => p.z)), Math.max(...polygon.map((p) => p.x)), Math.max(...polygon.map((p) => p.z))]

/** Element-by-element error of a candidate plan against a reference, in centimetres. */
export function planDiff(reference: PlanLike, candidate: PlanLike): PlanDiff {
  const refWalls = reference.walls.map(segment)
  const candWalls = candidate.walls.map(segment)
  const wallError = Math.max(0, ...refWalls.map((wall) => nearest(candWalls, (other) => segmentError(wall, other)).d), ...candWalls.map((wall) => nearest(refWalls, (other) => segmentError(wall, other)).d))
  const refOpenings = openingCentres(reference)
  const candOpenings = openingCentres(candidate)
  const matches = refOpenings.map((opening) => {
    const { item, d } = nearest(candOpenings, (other) => Math.hypot(other.x - opening.x, other.z - opening.z))
    return { d, kindMismatch: item ? item.kind !== opening.kind : true, widthError: item ? Math.abs(item.width - opening.width) : Infinity }
  })
  const zoneByName = new Map(candidate.zones.map((zone) => [zone.name.toLowerCase(), zone]))
  const missing = reference.zones.filter((zone) => !zoneByName.has(zone.name.toLowerCase())).map((zone) => zone.name)
  const zoneErrors = reference.zones.flatMap((zone) => {
    const other = zoneByName.get(zone.name.toLowerCase())
    return other ? [segmentError(bounds(zone.polygon), bounds(other.polygon))] : []
  })
  return {
    walls: { reference: refWalls.length, candidate: candWalls.length, maxEndpointErrorCm: candWalls.length === 0 ? Infinity : wallError },
    openings: {
      reference: refOpenings.length,
      candidate: candOpenings.length,
      kindMismatches: matches.filter((match) => match.kindMismatch).length,
      maxCentreErrorCm: Math.max(0, ...matches.map((match) => match.d)),
      maxWidthErrorCm: Math.max(0, ...matches.map((match) => match.widthError))
    },
    zones: { reference: reference.zones.length, candidate: candidate.zones.length, missing, maxBoundsErrorCm: Math.max(0, ...zoneErrors) }
  }
}

const planOf = (path: string): PlanLike => {
  const json = JSON.parse(readFileSync(path, 'utf8'))
  return json.room ?? json
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [reference, candidate] = process.argv.slice(2)
  if (!reference || !candidate) {
    console.error('usage: pnpm plan-diff <reference plan or layout .json> <candidate plan or layout .json>')
    process.exit(2)
  }
  console.log(JSON.stringify(planDiff(planOf(reference), planOf(candidate)), null, 2))
}
