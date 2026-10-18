import type { Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { fitGlbBytes } from '../../packages/fit/src/index.ts'
import type { Asset } from '../../packages/schema/src/index.ts'
import { comfyHolding, comfyOutputFile } from './comfy.ts'

const loader = new GLTFLoader()
const loads = new Map<string, Promise<Object3D | null>>()

/** Identifies the mesh an asset renders: a ComfyUI output is re-fitted per listed size and fit mode. */
export function meshKey({ uri, dimensions, fit }: Asset): string {
  if (!comfyOutputFile(uri)) return uri
  return `${uri}#${dimensions.width}x${dimensions.depth}x${dimensions.height}:${fit?.mode ?? 'exact'}`
}

async function loadComfyOutput(asset: Asset): Promise<Object3D | null> {
  const file = comfyOutputFile(asset.uri)
  const downloaded = file && (await comfyHolding(asset.uri).download(file))
  if (!downloaded?.ok) return null
  const fitted = await fitGlbBytes(downloaded.bytes, asset.dimensions, asset.fit?.mode)
  if (!fitted.ok) return null
  return (await loader.parseAsync(new Uint8Array(fitted.bytes).buffer, '')).scene
}

async function loadFitted(asset: Asset): Promise<Object3D | null> {
  try {
    return comfyOutputFile(asset.uri) ? await loadComfyOutput(asset) : (await loader.loadAsync(asset.uri)).scene
  } catch {
    return null
  }
}

/** Loads an asset's fitted mesh once per mesh key; resolves to null when it cannot be loaded. */
export function loadMesh(asset: Asset): Promise<Object3D | null> {
  const key = meshKey(asset)
  const cached = loads.get(key)
  if (cached) return cached
  const pending = loadFitted(asset)
  loads.set(key, pending)
  return pending
}
