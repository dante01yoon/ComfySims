import { Html, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useState } from 'react'
import { Plane, PlaneGeometry, Vector3 } from 'three'

const floorPlane = new Plane(new Vector3(0, 1, 0), 0)
const CATCHER_SIZE_CM = 100000
const floorCatcher = new PlaneGeometry(CATCHER_SIZE_CM, CATCHER_SIZE_CM).rotateX(-Math.PI / 2)
const ABOVE_FLOOR_CM = 2
const MARKER_RADIUS_CM = 4
const CLICK_SLOP_PX = 4
const RULER_COLOR = '#ffb020'

type FloorPoint = { x: number; z: number }

function floorPointOf(event: ThreeEvent<PointerEvent | MouseEvent>): FloorPoint | null {
  const hit = event.ray.intersectPlane(floorPlane, new Vector3())
  return hit && { x: hit.x, z: hit.z }
}

function distanceCm(a: FloorPoint, b: FloorPoint): number {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

function lifted({ x, z }: FloorPoint): [number, number, number] {
  return [x, ABOVE_FLOOR_CM, z]
}

function Marker({ point }: { point: FloorPoint }) {
  return (
    <mesh position={lifted(point)} renderOrder={10}>
      <sphereGeometry args={[MARKER_RADIUS_CM, 16, 8]} />
      <meshBasicMaterial color={RULER_COLOR} depthTest={false} />
    </mesh>
  )
}

function Measurement({ from, to }: { from: FloorPoint; to: FloorPoint }) {
  const middle = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 }
  return (
    <>
      <Line points={[lifted(from), lifted(to)]} color={RULER_COLOR} lineWidth={3} depthTest={false} renderOrder={10} />
      <Html position={lifted(middle)} center zIndexRange={[6, 0]}>
        <div className="ruler-label" role="status" aria-label="Measured distance">{`${Math.round(distanceCm(from, to))} cm`}</div>
      </Html>
    </>
  )
}

/** Floor ruler: the first click sets a start point, the second an end point, and the line between them shows its length in cm. */
export function Ruler() {
  const [points, setPoints] = useState<FloorPoint[]>([])
  const [hover, setHover] = useState<FloorPoint | null>(null)
  const [start, end] = points
  const choosingEnd = start !== undefined && end === undefined

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > CLICK_SLOP_PX) return
    const point = floorPointOf(event)
    if (!point) return
    setPoints(choosingEnd ? [start, point] : [point])
    setHover(null)
  }

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (choosingEnd) setHover(floorPointOf(event))
  }

  const shownEnd = end ?? (choosingEnd ? hover : null)

  return (
    <group>
      <mesh geometry={floorCatcher} onClick={onClick} onPointerMove={onPointerMove}>
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
      {points.map((point, index) => (
        <Marker key={index} point={point} />
      ))}
      {start && shownEnd && <Measurement from={start} to={shownEnd} />}
    </group>
  )
}
