import type { FitReport, OptimiseReport } from '../../packages/fit/src/index.ts'
import type { Dimensions, FitMode } from '../../packages/schema/src/index.ts'
import type { RoomfitEditorApi } from '../../spec/contracts/editor-api.ts'

export type GlbStats = NonNullable<ReturnType<RoomfitEditorApi['assetStats']>>

/** GLB bytes for the worker: optimised for a piece of `largestCm`, then fitted to `fit` when given. */
export type FitJob = { bytes: Uint8Array; largestCm: number; fit: { dimensions: Dimensions; mode: FitMode } | null }

export type Processed = { bytes: Uint8Array; fit: FitReport | null; optimised: OptimiseReport | undefined; stats: GlbStats }

export type FitResult = ({ ok: true } & Processed) | { ok: false; reason: string }

const DATABASE = 'comfysims-assets'
const STORE = 'glb'

let worker: Worker | null = null
let jobs = 0
const waiting = new Map<number, (result: FitResult) => void>()

function fitWorker(): Worker {
  if (worker) return worker
  const started = new Worker(new URL('./fit.worker.ts', import.meta.url), { type: 'module', name: 'fit' })
  started.onmessage = ({ data }: MessageEvent<{ id: number; result: FitResult }>) => {
    waiting.get(data.id)?.(data.result)
    waiting.delete(data.id)
  }
  worker = started
  return started
}

/** Optimises (and fits) GLB bytes in the fit worker; the bytes are transferred, so the caller must not use them afterwards. */
export function inWorker(job: FitJob): Promise<FitResult> {
  const id = ++jobs
  return new Promise((resolve) => {
    waiting.set(id, resolve)
    fitWorker().postMessage({ ...job, id }, [job.bytes.buffer])
  })
}

let database: Promise<IDBDatabase | null> | null = null

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function opened(): Promise<IDBDatabase | null> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch(() => null)
  return database
}

async function inStore<T>(mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await opened()
    return db ? await done(request(db.transaction(STORE, mode).objectStore(STORE))) : undefined
  } catch {
    return undefined
  }
}

/** The processed GLB stored under a key, or undefined when it is missing or the cache cannot be read. */
export async function cachedGlb(key: string): Promise<Processed | undefined> {
  const value: unknown = await inStore('readonly', (store) => store.get(key))
  return value === undefined ? undefined : (value as Processed)
}

export async function storeGlb(key: string, value: Processed): Promise<void> {
  await inStore('readwrite', (store) => store.put(value, key))
}

export async function clearGlbCache(): Promise<void> {
  await inStore('readwrite', (store) => store.clear())
}
