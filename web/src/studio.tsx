import { useFrame } from '@react-three/fiber'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useMemo, useRef, useSyncExternalStore } from 'react'
import { Color, SRGBColorSpace, type DirectionalLight, type HemisphereLight, type PointLight } from 'three'

import type { PlanRoom, Room, Zone } from '../../packages/schema/src/index.ts'
import type { Lighting, ScenePreset, Vec3 } from '../../spec/contracts/editor-api.ts'
import { api, snapshot, subscribe } from './editor.ts'
import { seededRandom } from './floors.ts'
import { boundsCenter, compassDirection, roomBounds, type Bounds } from './framing.ts'

type Levels = Omit<Lighting, 'preset'>

const LIGHT_RESPONSE_PER_SECOND = 5
const SUN_DISTANCE_CM = 4000
const SHADOW_HALF_EXTENT_CM = 1300
const INTERIOR_LIGHT_BELOW_CEILING_CM = 40
const INTERIOR_INTENSITY_SCALE = 0.7
const NIGHT_SKY = new Color('#7d8fb3')
const SKY = new Color('#dfe6ee')
const GROUND_BOUNCE = new Color('#6f6250')
const GRASS = '#2d4a27'
const LOT_MARGIN_CM = 820
const WIDE_DOOR_CM = 200

const PRESET_BUTTONS: { preset: ScenePreset; label: string; dot: string }[] = [
  { preset: 'reading', label: 'Reading', dot: '#f3b562' },
  { preset: 'work', label: 'Work', dot: '#79c3f0' },
  { preset: 'movie', label: 'Movie', dot: '#a68cf2' },
  { preset: 'evening', label: 'Evening', dot: '#f0845c' }
]

function channel(value: number): number {
  return Math.min(255, Math.max(0, value)) / 255
}

function kelvinColor(kelvin: number): Color {
  const t = kelvin / 100
  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const green = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  return new Color().setRGB(channel(red), channel(green), channel(blue), SRGBColorSpace)
}

function approach(current: Levels, target: Levels, step: number): Levels {
  const toward = (key: keyof Levels) => current[key] + (target[key] - current[key]) * step
  return {
    sunElevationDeg: toward('sunElevationDeg'),
    sunAzimuthDeg: toward('sunAzimuthDeg'),
    sunKelvin: toward('sunKelvin'),
    sunIntensity: toward('sunIntensity'),
    interiorKelvin: toward('interiorKelvin'),
    interiorIntensity: toward('interiorIntensity')
  }
}

function daylight({ sunIntensity, sunElevationDeg }: Levels): number {
  return Math.min(1, (sunIntensity / 3) * Math.sin((Math.max(0, sunElevationDeg) * Math.PI) / 180) * 1.25)
}

function zoneLight(zone: Zone): { position: [number, number]; reach: number } {
  const xs = zone.polygon.map(({ x }) => x)
  const zs = zone.polygon.map(({ z }) => z)
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  const reach = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 0.65
  return { position: [average(xs), average(zs)], reach }
}

function Lights({ room, bounds }: { room: Room; bounds: Bounds }) {
  const levels = useRef<Levels>(api.lighting())
  const sun = useRef<DirectionalLight>(null)
  const sky = useRef<HemisphereLight>(null)
  const interiors = useRef<(PointLight | null)[]>([])
  const center = boundsCenter(bounds)
  const zones = room.kind === 'plan' ? room.zones.map(zoneLight) : []
  const ceiling = room.kind === 'plan' ? room.wallHeight : room.height

  useFrame((_, delta) => {
    const step = 1 - Math.exp(-Math.min(delta, 0.25) * LIGHT_RESPONSE_PER_SECOND)
    const current = (levels.current = approach(levels.current, api.lighting(), step))
    const day = daylight(current)
    if (sun.current) {
      const direction = compassDirection(current.sunAzimuthDeg, current.sunElevationDeg)
      sun.current.position.set(center.x + direction.x * SUN_DISTANCE_CM, direction.y * SUN_DISTANCE_CM, center.z + direction.z * SUN_DISTANCE_CM)
      sun.current.target.position.set(center.x, 0, center.z)
      sun.current.target.updateMatrixWorld()
      sun.current.color.copy(kelvinColor(current.sunKelvin))
      sun.current.intensity = current.sunIntensity * 1.1
    }
    if (sky.current) {
      sky.current.intensity = 0.9 + 0.3 * day
      sky.current.color.copy(NIGHT_SKY).lerp(SKY.clone().lerp(kelvinColor(current.sunKelvin), 0.5), day)
    }
    const interiorColor = kelvinColor(current.interiorKelvin)
    for (const light of interiors.current) {
      if (!light) continue
      light.color.copy(interiorColor)
      light.intensity = current.interiorIntensity * INTERIOR_INTENSITY_SCALE
    }
  })

  return (
    <>
      <hemisphereLight ref={sky} args={[SKY, GROUND_BOUNCE, 0.8]} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={2}
        shadow-radius={6}
        shadow-camera-left={-SHADOW_HALF_EXTENT_CM}
        shadow-camera-right={SHADOW_HALF_EXTENT_CM}
        shadow-camera-top={SHADOW_HALF_EXTENT_CM}
        shadow-camera-bottom={-SHADOW_HALF_EXTENT_CM}
        shadow-camera-near={100}
        shadow-camera-far={SUN_DISTANCE_CM * 2}
      />
      {zones.map(({ position: [x, z], reach }, index) => (
        <pointLight
          key={index}
          ref={(light) => {
            interiors.current[index] = light
          }}
          position={[x, ceiling - INTERIOR_LIGHT_BELOW_CEILING_CM, z]}
          distance={reach}
          decay={0}
        />
      ))}
    </>
  )
}

type Path = { center: Vec3; normal: { x: number; z: number }; halfWidth: number; halfLength: number; wide: boolean }

function onPerimeter(room: PlanRoom, bounds: Bounds, wallId: string): boolean {
  const wall = room.walls.find(({ id }) => id === wallId)
  if (!wall) return false
  const sameEdge = (a: number, b: number, edge: number) => a === edge && b === edge
  return (
    sameEdge(wall.from.x, wall.to.x, bounds.min.x) ||
    sameEdge(wall.from.x, wall.to.x, bounds.max.x) ||
    sameEdge(wall.from.z, wall.to.z, bounds.min.z) ||
    sameEdge(wall.from.z, wall.to.z, bounds.max.z)
  )
}

function entrancePaths(room: Room, bounds: Bounds): Path[] {
  if (room.kind !== 'plan') return []
  const middle = boundsCenter(bounds)
  return room.openings
    .filter((opening) => opening.kind === 'door' && onPerimeter(room, bounds, opening.wallId))
    .flatMap((opening): Path[] => {
      const wall = room.walls.find(({ id }) => id === opening.wallId)
      if (!wall) return []
      const length = Math.hypot(wall.to.x - wall.from.x, wall.to.z - wall.from.z)
      const along = (opening.offset + opening.width / 2) / length
      const door = { x: wall.from.x + (wall.to.x - wall.from.x) * along, z: wall.from.z + (wall.to.z - wall.from.z) * along }
      const perpendicular = { x: -(wall.to.z - wall.from.z) / length, z: (wall.to.x - wall.from.x) / length }
      const outward = (door.x - middle.x) * perpendicular.x + (door.z - middle.z) * perpendicular.z
      const normal = outward >= 0 ? perpendicular : { x: -perpendicular.x, z: -perpendicular.z }
      const wide = opening.width >= WIDE_DOOR_CM
      const halfLength = wide ? 380 : 260
      const offset = room.wallThickness / 2 + halfLength
      return [
        {
          center: { x: door.x + normal.x * offset, y: 0, z: door.z + normal.z * offset },
          normal,
          halfWidth: opening.width / 2 + (wide ? 40 : 25),
          halfLength,
          wide
        }
      ]
    })
}

function clearOfPaths(point: { x: number; z: number }, paths: readonly Path[], padding: number): boolean {
  return paths.every(({ center, normal, halfWidth, halfLength }) => {
    const dx = point.x - center.x
    const dz = point.z - center.z
    const alongPath = Math.abs(dx * normal.x + dz * normal.z)
    const across = Math.abs(dx * normal.z - dz * normal.x)
    return alongPath > halfLength + padding || across > halfWidth + padding
  })
}

function perimeterPoint({ min, max }: Bounds, margin: number, u: number): { x: number; z: number } {
  const width = max.x - min.x + 2 * margin
  const depth = max.z - min.z + 2 * margin
  let distance = (u % 1) * 2 * (width + depth)
  const left = min.x - margin
  const top = min.z - margin
  if (distance < width) return { x: left + distance, z: top }
  distance -= width
  if (distance < depth) return { x: left + width, z: top + distance }
  distance -= depth
  if (distance < width) return { x: left + width - distance, z: top + depth }
  return { x: left, z: top + depth - (distance - width) }
}

type Plant = { x: number; z: number; size: number; tone: number }

function scatter(bounds: Bounds, paths: readonly Path[], count: number, margin: [number, number], seed: number): Plant[] {
  const random = seededRandom(seed)
  return Array.from({ length: count }, (_, index) => {
    const point = perimeterPoint(bounds, margin[0] + random() * (margin[1] - margin[0]), (index + random() * 0.6) / count)
    return { ...point, size: 0.75 + random() * 0.5, tone: random() }
  }).filter((plant) => clearOfPaths(plant, paths, 120))
}

const LEAVES = ['#2f5a29', '#3a6a30', '#2a4f26']

function Tree({ x, z, size, tone }: Plant) {
  const trunk = 150 * size
  const crown = 150 * size
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={trunk / 2} castShadow>
        <cylinderGeometry args={[10 * size, 16 * size, trunk, 6]} />
        <meshStandardMaterial color="#5e4330" roughness={1} />
      </mesh>
      <mesh position-y={trunk + crown * 0.55} scale={[1, 1.15, 1]} castShadow>
        <icosahedronGeometry args={[crown, 0]} />
        <meshStandardMaterial color={LEAVES[Math.floor(tone * LEAVES.length)]} roughness={0.9} flatShading />
      </mesh>
    </group>
  )
}

function Shrub({ x, z, size, tone }: Plant) {
  const radius = 55 * size
  return (
    <mesh position={[x, radius * 0.6, z]} scale={[1, 0.8, 1]} castShadow receiveShadow>
      <icosahedronGeometry args={[radius, 1]} />
      <meshStandardMaterial color={LEAVES[Math.floor(tone * LEAVES.length)]} roughness={0.95} flatShading />
    </mesh>
  )
}

function Landscape({ room, bounds }: { room: Room; bounds: Bounds }) {
  const paths = useMemo(() => entrancePaths(room, bounds), [room, bounds])
  const trees = useMemo(() => scatter(bounds, paths, 9, [380, 650], 11), [bounds, paths])
  const shrubs = useMemo(() => scatter(bounds, paths, 26, [80, 130], 23), [bounds, paths])
  const center = boundsCenter(bounds)
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[center.x, -1, center.z]} receiveShadow>
        <planeGeometry args={[bounds.max.x - bounds.min.x + 2 * LOT_MARGIN_CM, bounds.max.z - bounds.min.z + 2 * LOT_MARGIN_CM]} />
        <meshStandardMaterial color={GRASS} roughness={1} />
      </mesh>
      {paths.map(({ center: path, normal, halfWidth, halfLength, wide }) => (
        <mesh key={`${path.x}|${path.z}`} position={[path.x, 0.5, path.z]} rotation-y={Math.atan2(normal.x, normal.z)} receiveShadow>
          <boxGeometry args={[halfWidth * 2, 2, halfLength * 2]} />
          <meshStandardMaterial color={wide ? '#b4afa6' : '#cbc3b5'} roughness={0.95} />
        </mesh>
      ))}
      {trees.map((plant) => (
        <Tree key={`${plant.x}|${plant.z}`} {...plant} />
      ))}
      {shrubs.map((plant) => (
        <Shrub key={`${plant.x}|${plant.z}`} {...plant} />
      ))}
    </group>
  )
}

/** Sun, warm interior lights, landscape, AO and filmic tone mapping around the room. */
export function StudioScene({ room }: { room: Room }) {
  const bounds = useMemo(() => roomBounds(room), [room])
  return (
    <>
      <Lights room={room} bounds={bounds} />
      <Landscape room={room} bounds={bounds} />
      <EffectComposer multisampling={4}>
        <N8AO aoRadius={60} distanceFalloff={1.2} intensity={2.2} quality="performance" halfRes />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  )
}

/** One chip per zone above the preset bar; pressing the active chip returns to the whole house. */
export function ZoneChips({ room }: { room: Room }) {
  const { focusedZone } = useSyncExternalStore(subscribe, snapshot)
  if (room.kind !== 'plan') return null
  return (
    <nav className="zone-chips" aria-label="Rooms">
      {room.zones.map((zone) => (
        <button key={zone.id} aria-pressed={focusedZone === zone.id} onClick={() => api.focusZone(focusedZone === zone.id ? null : zone.id)}>
          {zone.name}
        </button>
      ))}
    </nav>
  )
}

function studioPrompt(roomName: string | undefined, preset: ScenePreset): string {
  const subject = roomName ? `the ${roomName.toLowerCase()} of a bright modern home` : 'a bright modern home'
  return `Photograph of ${subject}, ${preset} light, photorealistic interior, natural materials, soft shadows`
}

/** Pill bar of scene presets over the studio view, with a button that renders the current view. */
export function PresetBar({ room }: { room: Room }) {
  const { scene, focusedZone } = useSyncExternalStore(subscribe, snapshot)
  const zoneName = room.kind === 'plan' ? room.zones.find(({ id }) => id === focusedZone)?.name : undefined
  return (
    <nav className="preset-bar" aria-label="Scene presets">
      {PRESET_BUTTONS.map(({ preset, label, dot }) => (
        <button key={preset} aria-pressed={scene === preset} onClick={() => api.setScene(preset)}>
          <span className="dot" style={{ background: dot }} />
          {label}
        </button>
      ))}
      <button onClick={() => api.renderInComfy({ prompt: studioPrompt(zoneName, scene) })}>Render this view</button>
    </nav>
  )
}
