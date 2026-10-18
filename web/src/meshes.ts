import type { Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const loader = new GLTFLoader()
const loads = new Map<string, Promise<Object3D | null>>()

/** Loads a fitted GLB once per uri; resolves to null when it cannot be loaded. */
export function loadMesh(uri: string): Promise<Object3D | null> {
  const cached = loads.get(uri)
  if (cached) return cached
  const pending = loader.loadAsync(uri).then(
    (gltf) => gltf.scene,
    () => null
  )
  loads.set(uri, pending)
  return pending
}
