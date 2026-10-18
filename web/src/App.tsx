import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import { Color, DoubleSide, Mesh, MeshStandardMaterial, Plane, Vector3, type Material, type Object3D } from 'three'

import { collisions, outOfBounds } from '../../packages/placement/src/index.ts'
import { serializeLayout, type Asset, type PlacedItem, type Room as BoxRoom } from '../../packages/schema/src/index.ts'
import { api, attachControls, attachThree, beginDrag, endDrag, loadUnknown, markCommitted, select, snapshot, subscribe } from './editor.ts'

const METERS_TO_CM = 100
const ROTATE_STEP_DEGREES = 15
const floorPlane = new Plane(new Vector3(0, 1, 0), 0)
const emphasisColors = { none: new Color(0x000000), selected: new Color(0x1f4f8f), problem: new Color(0xb3261e) }

type Emphasis = keyof typeof emphasisColors

function Bridge({ revision }: { revision: number }) {
  const get = useThree((three) => three.get)
  useEffect(() => attachThree(get), [get])
  useLayoutEffect(() => markCommitted(revision), [revision])
  return null
}

function Room({ room }: { room: BoxRoom }) {
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
        <mesh position-y={height / 2}>
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
      if (event.target instanceof HTMLInputElement) return
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

function Panel() {
  const editor = useSyncExternalStore(subscribe, snapshot)
  const [loadIssues, setLoadIssues] = useState<string[]>([])
  const { collisions: collidingPairs, outOfBounds: escapes, canUndo, canRedo, selectedId, layout } = useMemo(() => api.state(), [editor])

  const open = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const issues = await parseAndLoad(await file.text())
    setLoadIssues(issues)
  }

  return (
    <aside>
      <label>
        Open layout <input type="file" accept=".json,application/json" onChange={open} />
      </label>
      <div>
        <button onClick={download}>Save</button>
        <button onClick={api.undo} disabled={!canUndo}>Undo</button>
        <button onClick={api.redo} disabled={!canRedo}>Redo</button>
      </div>
      {loadIssues.map((issue) => (
        <div key={issue} className="problem">{issue}</div>
      ))}
      <h2>Room</h2>
      <div>{layout.name}: {layout.room.width} × {layout.room.depth} × {layout.room.height} cm</div>
      <h2>Selected</h2>
      {selectedId ? (
        <div>
          <div>{selectedId}</div>
          <button onClick={() => rotateSelected(1)}>Rotate ⟲ (Q)</button>
          <button onClick={() => rotateSelected(-1)}>Rotate ⟳ (E)</button>
          <button onClick={removeSelected}>Remove (Del)</button>
        </div>
      ) : (
        <div>Click an item, drag it on the floor.</div>
      )}
      <h2>Problems</h2>
      {collidingPairs.map(({ a, b }) => (
        <div key={`${a}|${b}`} className="problem">{a} collides with {b}</div>
      ))}
      {escapes.map(({ itemId, reason }) => (
        <div key={`${itemId}|${reason}`} className="problem">{itemId}: {reason}</div>
      ))}
      {collidingPairs.length + escapes.length === 0 && <div>None</div>}
    </aside>
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
  useKeyboardShortcuts()

  return (
    <>
      <Canvas camera={{ fov: 50, near: 1, far: 20000, position: [0, 450, 550] }} onPointerMissed={() => select(null)}>
        <Bridge revision={editor.revision} />
        <hemisphereLight args={['#ffffff', '#8a8178', 1.2]} />
        <directionalLight position={[200, 400, 300]} intensity={1.5} />
        <OrbitControls makeDefault ref={attachControls} />
        <Room room={layout.room} />
        {layout.items.map((item) => {
          const asset = assets.get(item.assetId)
          return asset ? (
            <Item
              key={item.id}
              item={item}
              asset={asset}
              mesh={editor.meshes.get(asset.uri)}
              emphasis={emphasisOf(item.id, problems, editor.selectedId)}
            />
          ) : null
        })}
      </Canvas>
      <Panel />
    </>
  )
}
