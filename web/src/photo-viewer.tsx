import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { PointerEvent, WheelEvent } from 'react'
import { Box3, DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three'
import type { Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { api, captionOf, snapshot, subscribe, turnPhoto } from './editor.ts'

const DEGREES_PER_PIXEL = 0.1
const MAX_DOLLY_SHARE = 0.4
const DOLLY_SHARE_PER_WHEEL_UNIT = 0.0005
const UP = new Vector3(0, 1, 0)
const FORWARD = new Vector3(0, 0, -1)
const loader = new GLTFLoader()

type Framing = { depth: number; tanHalfWidth: number; tanHalfHeight: number }

function flatLit(scene: Object3D): Object3D {
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const source = object.material instanceof MeshStandardMaterial ? object.material : null
    object.material = new MeshBasicMaterial({ map: source?.map ?? null, color: source?.map ? '#ffffff' : (source?.color ?? '#cccccc'), vertexColors: source?.vertexColors ?? false, side: DoubleSide })
  })
  return scene
}

function framingOf(model: Object3D): Framing {
  model.updateMatrixWorld(true)
  const vertex = new Vector3()
  let tanHalfWidth = 0
  let tanHalfHeight = 0
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const positions = object.geometry.getAttribute('position')
    for (let index = 0; index < positions.count; index++) {
      vertex.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld)
      if (vertex.z >= 0) continue
      tanHalfWidth = Math.max(tanHalfWidth, Math.abs(vertex.x / vertex.z))
      tanHalfHeight = Math.max(tanHalfHeight, Math.abs(vertex.y / vertex.z))
    }
  })
  return { depth: new Box3().setFromObject(model).getCenter(new Vector3()).length(), tanHalfWidth, tanHalfHeight }
}

function coverFovDegrees({ tanHalfWidth, tanHalfHeight }: Framing, aspect: number): number {
  return (2 * Math.atan(Math.min(tanHalfHeight, tanHalfWidth / aspect)) * 180) / Math.PI
}

function lookDirection(forward: Vector3, yawDegrees: number, pitchDegrees: number): Vector3 {
  const turned = forward.clone().applyAxisAngle(UP, (yawDegrees * Math.PI) / 180)
  const right = turned.clone().cross(UP).normalize()
  return turned.applyAxisAngle(right, (pitchDegrees * Math.PI) / 180)
}

function PhotoCamera({ framing, dolly, yawDegrees, pitchDegrees }: { framing: Framing; dolly: number; yawDegrees: number; pitchDegrees: number }) {
  useFrame(({ camera, size }) => {
    if (camera instanceof PerspectiveCamera) {
      camera.fov = coverFovDegrees(framing, size.width / size.height)
      camera.updateProjectionMatrix()
    }
    camera.position.copy(FORWARD).multiplyScalar(dolly)
    camera.lookAt(camera.position.clone().add(lookDirection(FORWARD, yawDegrees, pitchDegrees)))
  })
  return null
}

function useModel(glb: string | undefined): Object3D | null {
  const [model, setModel] = useState<{ glb: string; scene: Object3D } | null>(null)
  useEffect(() => {
    if (!glb) return
    let current = true
    void loader.loadAsync(glb).then((gltf) => {
      if (current) setModel({ glb, scene: flatLit(gltf.scene) })
    })
    return () => {
      current = false
    }
  }, [glb])
  return model && model.glb === glb ? model.scene : null
}

/** The full-screen 3D photo viewer: the MoGe mesh seen from the photo's camera, with limited turning. */
export function PhotoViewer() {
  const { photoViewer, jobs } = useSyncExternalStore(subscribe, snapshot)
  const glb = jobs.find(({ id }) => id === photoViewer?.jobId)?.result?.glb
  const model = useModel(glb)
  const framing = useMemo(() => (model ? framingOf(model) : null), [model])
  const [dolly, setDolly] = useState(0)
  const dragFrom = useRef<{ x: number; y: number } | null>(null)
  const [dollyGlb, setDollyGlb] = useState(glb)
  if (dollyGlb !== glb) {
    setDollyGlb(glb)
    setDolly(0)
  }
  if (!photoViewer) return null

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragFrom.current = { x: event.clientX, y: event.clientY }
  }
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current
    if (!from) return
    turnPhoto(-(event.clientX - from.x) * DEGREES_PER_PIXEL, -(event.clientY - from.y) * DEGREES_PER_PIXEL)
    dragFrom.current = { x: event.clientX, y: event.clientY }
  }
  const moveForward = (event: WheelEvent<HTMLDivElement>) => {
    if (!framing) return
    const step = -event.deltaY * DOLLY_SHARE_PER_WHEEL_UNIT * framing.depth
    setDolly((current) => Math.min(MAX_DOLLY_SHARE * framing.depth, Math.max(0, current + step)))
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="3D photo" className="photo-viewer">
      <div className="photo-stage" onPointerDown={startDrag} onPointerMove={drag} onPointerUp={() => (dragFrom.current = null)} onWheel={moveForward}>
        <Canvas camera={{ near: 0.01, far: 1000, position: [0, 0, 0] }}>
          {model && framing && (
            <>
              <primitive object={model} />
              <PhotoCamera framing={framing} dolly={dolly} yawDegrees={photoViewer.yawDegrees} pitchDegrees={photoViewer.pitchDegrees} />
            </>
          )}
        </Canvas>
        {!model && <div className="photo-loading" role="status">Loading 3D photo…</div>}
      </div>
      <button className="photo-back" onClick={api.closePhoto3d}>Back</button>
      <div className="photo-caption">{captionOf(photoViewer.jobId)}</div>
    </div>
  )
}
