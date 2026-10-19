import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useSyncExternalStore, type PointerEvent, type WheelEvent } from 'react'
import { BackSide, PerspectiveCamera, SRGBColorSpace, TextureLoader } from 'three'

import type { Viewer360 } from '../../spec/contracts/editor-api.ts'
import { api, snapshot, subscribe, turn360, zoom360 } from './editor.ts'

const HALF_TURN_DEG = 180
const QUARTER_TURN_DEG = 90
const FOV_DEG_PER_WHEEL_UNIT = 0.05
const SPHERE_RADIUS = 100
const IMAGE_CENTRE_AT_PLUS_Z = -Math.PI / 2

function Panorama({ image }: { image: string }) {
  const texture = useLoader(TextureLoader, image)
  texture.colorSpace = SRGBColorSpace
  return (
    <mesh>
      <sphereGeometry args={[SPHERE_RADIUS, 96, 48, IMAGE_CENTRE_AT_PLUS_Z]} />
      <meshBasicMaterial map={texture} side={BackSide} />
    </mesh>
  )
}

function LookAround({ yawDegrees, pitchDegrees, fovDegrees }: Pick<Viewer360, 'yawDegrees' | 'pitchDegrees' | 'fovDegrees'>) {
  useFrame(({ camera }) => {
    if (camera instanceof PerspectiveCamera && camera.fov !== fovDegrees) {
      camera.fov = fovDegrees
      camera.updateProjectionMatrix()
    }
    const yaw = (yawDegrees * Math.PI) / 180
    const pitch = (pitchDegrees * Math.PI) / 180
    camera.lookAt(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  })
  return null
}

/** Calls `close` when Escape is pressed anywhere; pass null while there is nothing to close. */
export function useEscapeCloses(close: (() => void) | null): void {
  useEffect(() => {
    if (!close) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])
}

/** The full-window 360° viewer: the panorama on the inside of a sphere; drag to look around, wheel to zoom. */
export function PanoramaViewer() {
  useSyncExternalStore(subscribe, snapshot)
  const viewer = api.state().viewer360
  const image = snapshot().jobs.find(({ id }) => id === viewer?.jobId)?.result?.image
  const dragFrom = useRef<{ x: number; y: number } | null>(null)
  useEscapeCloses(viewer !== null ? api.close360 : null)
  if (!viewer || !image) return null

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragFrom.current = { x: event.clientX, y: event.clientY }
  }
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current
    if (!from) return
    const { width, height } = event.currentTarget.getBoundingClientRect()
    turn360((-(event.clientX - from.x) / width) * HALF_TURN_DEG, (-(event.clientY - from.y) / height) * QUARTER_TURN_DEG)
    dragFrom.current = { x: event.clientX, y: event.clientY }
  }
  const zoom = (event: WheelEvent<HTMLDivElement>) => zoom360(event.deltaY * FOV_DEG_PER_WHEEL_UNIT)

  return (
    <div role="dialog" aria-modal="true" aria-label="360° view" className="photo-viewer">
      <div className="photo-stage" onPointerDown={startDrag} onPointerMove={drag} onPointerUp={() => (dragFrom.current = null)} onWheel={zoom}>
        <Canvas camera={{ near: 0.1, far: SPHERE_RADIUS * 2, position: [0, 0, 0] }}>
          <Suspense fallback={null}>
            <Panorama image={image} />
          </Suspense>
          <LookAround yawDegrees={viewer.yawDegrees} pitchDegrees={viewer.pitchDegrees} fovDegrees={viewer.fovDegrees} />
        </Canvas>
      </div>
      <button className="photo-back" onClick={api.close360}>Close</button>
      {viewer.stale && <div className="photo-caption problem">Layout changed since this view</div>}
    </div>
  )
}
