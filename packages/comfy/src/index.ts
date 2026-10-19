import { z } from 'zod'

import type { ApiWorkflow } from '../../../harness/tools/lint-workflow.ts'
import { inPolygon } from '../../placement/src/index.ts'
import { DEFAULT_EXPECTED_SECONDS } from '../../schema/src/index.ts'
import type { BackendKind, Dimensions, FitMode, FloorMaterial, Job, JobKind, RoomLayout, Zone } from '../../schema/src/index.ts'

export type PromptOutcome = { ok: true; prompt: ApiWorkflow } | { ok: false; missing: string[] }

type InputsByTag = Record<string, Record<string, unknown>>

function wireTaggedInputs(workflow: ApiWorkflow, inputsByTag: InputsByTag): PromptOutcome {
  const prompt = structuredClone(workflow)
  const missing: string[] = []
  for (const [tag, inputs] of Object.entries(inputsByTag)) {
    const node = Object.values(prompt).find((candidate) => candidate._meta?.title === tag)
    if (node) Object.assign(node.inputs, inputs)
    else missing.push(tag)
  }
  return missing.length > 0 ? { ok: false, missing } : { ok: true, prompt }
}

/** The default render prompt for a room (or the whole home) under a scene preset. */
export function studioPrompt(roomName: string | undefined, preset: string): string {
  const subject = roomName ? `the ${roomName.toLowerCase()} of a bright modern home` : 'a bright modern home'
  return `Photograph of ${subject}, ${preset} light, photorealistic interior, natural materials, soft shadows`
}

export type RenderStyle = NonNullable<RoomLayout['renderStyle']>

const FLOOR_WORDS: Record<FloorMaterial, string> = {
  oak: 'oak wood floor',
  walnut: 'walnut wood floor',
  tile: 'ceramic tile floor',
  concrete: 'polished concrete floor',
  carpet: 'wool carpet'
}

const PRESET_WORDS: Record<string, string> = {
  reading: 'warm reading light',
  work: 'bright daylight',
  movie: 'dim evening light',
  evening: 'warm evening light'
}

const ROOM_DETAILS: { names: string[]; details: string }[] = [
  { names: ['living'], details: 'wool rug, linen curtains, houseplants, framed prints, table lamp, books' },
  { names: ['bed'], details: 'linen bedding, linen curtains, bedside lamp, framed prints, houseplant, rug' },
  { names: ['kitchen', 'dining'], details: 'fruit bowl, cookbooks, pendant lights, plants' },
  { names: ['bath'], details: 'folded towels, plant, toiletries' },
  { names: ['office', 'study'], details: 'books, desk lamp, plants, pinboard' }
]

const MAX_FURNITURE = 8
const LIVED_IN_NEGATIVE = 'empty room, white walls, sterile, showroom, CGI, 3d render, cartoon, blurry, distorted, low quality, text'
const AS_BUILT_NEGATIVE = 'blurry, distorted'

function roomDetails(roomName: string): string {
  const name = roomName.toLowerCase()
  return ROOM_DETAILS.find(({ names }) => names.some((word) => name.includes(word)))?.details ?? 'rug, plants, framed prints'
}

function furnitureNames(layout: RoomLayout, zone: Zone | undefined): string[] {
  const items = zone ? layout.items.filter(({ position }) => inPolygon(position, zone.polygon)) : layout.items
  const names = items.flatMap(({ assetId }) => layout.assets.find(({ id }) => id === assetId)?.name.toLowerCase() ?? [])
  return [...new Set(names)].slice(0, MAX_FURNITURE)
}

/** The positive and negative render prompts for a room (or the whole home when `zoneId` is null), built from the layout. */
export function scenePrompt(layout: RoomLayout, zoneId: string | null, preset: string, style: RenderStyle): { positive: string; negative: string } {
  const zone = layout.room.kind === 'plan' ? layout.room.zones.find(({ id }) => id === zoneId) : undefined
  if (style === 'as-built') return { positive: studioPrompt(zone?.name, preset), negative: AS_BUILT_NEGATIVE }
  const subject = zone ? zone.name.toLowerCase() : 'home'
  const parts = [...furnitureNames(layout, zone), ...(zone ? [FLOOR_WORDS[zone.floor]] : []), 'warm greige painted walls', roomDetails(zone?.name ?? ''), 'realistic interior photography', 'natural imperfections']
  return { positive: `Photograph of a lived-in ${subject} in the ${PRESET_WORDS[preset] ?? `${preset} light`}: ${parts.join(', ')}`, negative: LIVED_IN_NEGATIVE }
}

/** Fills the tagged inputs of a product-to-glb workflow; the template is never mutated. */
export function buildProductPrompt(
  workflow: ApiWorkflow,
  input: { imageName: string; dimensions: Dimensions; mode: FitMode; seed: number }
): PromptOutcome {
  return wireTaggedInputs(workflow, {
    'roomfit:product-image': { image: input.imageName },
    'roomfit:fit': {
      width_cm: input.dimensions.width,
      depth_cm: input.dimensions.depth,
      height_cm: input.dimensions.height,
      mode: input.mode
    },
    'roomfit:seed': { seed: input.seed }
  })
}

/** Fills the tagged inputs of a photo-to-3D workflow that saves its mesh unfitted; the template is never mutated. */
export function buildPhotoTo3dPrompt(workflow: ApiWorkflow, input: { imageName: string; seed: number }): PromptOutcome {
  return wireTaggedInputs(workflow, {
    'roomfit:product-image': { image: input.imageName },
    'roomfit:seed': { seed: input.seed },
    'roomfit:save': {}
  })
}

/** Fills the tagged inputs of a photo-to-3D-photo (MoGe) workflow; the template is never mutated. */
export function buildRoomPhotoPrompt(workflow: ApiWorkflow, input: { imageName: string }): PromptOutcome {
  return wireTaggedInputs(workflow, { 'roomfit:photo': { image: input.imageName }, 'roomfit:save': {} })
}

/** Fills the tagged inputs of a render-from-depth workflow; the template is never mutated. */
export function buildRenderPrompt(
  workflow: ApiWorkflow,
  input: { depthImageName: string; prompt: string; negativePrompt: string; seed: number }
): PromptOutcome {
  return wireTaggedInputs(workflow, {
    'roomfit:depth': { image: input.depthImageName },
    'roomfit:positive': { text: input.prompt },
    'roomfit:negative': { text: input.negativePrompt },
    'roomfit:seed': { seed: input.seed }
  })
}

const InputSpecs = z.record(z.string(), z.unknown())
const CatalogNode = z.object({ input: z.object({ required: InputSpecs.optional(), optional: InputSpecs.optional() }).optional() })

function modelOptions(spec: unknown): unknown[] | null {
  if (!Array.isArray(spec)) return null
  const [type, extra] = spec
  const options: unknown = Array.isArray(type) ? type : type === 'COMBO' ? z.object({ options: z.array(z.unknown()) }).safeParse(extra).data?.options : null
  const isUpload = z.object({ image_upload: z.literal(true) }).safeParse(extra).success
  return Array.isArray(options) && !isUpload ? options : null
}

/** The choices a ComfyUI's `/api/object_info` catalog lists for a node input, or null when the input is not a choice list. */
export function inputOptions(catalog: Record<string, unknown>, classType: string, inputName: string): unknown[] | null {
  const input = CatalogNode.safeParse(catalog[classType]).data?.input
  return modelOptions({ ...input?.required, ...input?.optional }[inputName])
}

/** Node classes a workflow uses that a ComfyUI's `/api/object_info` catalog lacks, plus model files it lacks on Local only. */
export function missingFromCatalog(workflow: ApiWorkflow, catalog: Record<string, unknown>, backendKind: BackendKind): string[] {
  const missing = new Set<string>()
  for (const { class_type, inputs } of Object.values(workflow)) {
    if (!Object.hasOwn(catalog, class_type)) {
      missing.add(class_type)
      continue
    }
    if (backendKind === 'cloud') continue
    for (const [name, value] of Object.entries(inputs)) {
      const options = inputOptions(catalog, class_type, name)
      if (typeof value === 'string' && options && !options.includes(value)) missing.add(value)
    }
  }
  return [...missing]
}

export type Failure = { ok: false; reason: 'unreachable' | 'http' | 'rejected' | 'failed' | 'cancelled'; message: string }

export type JobStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

export type SavedFile = { filename: string; subfolder: string; type: string }

type Fetch = typeof fetch
type Reached = { ok: true; response: Response } | Failure
type JobView = { status: JobStatus; outputs: Record<string, unknown>; error?: string }

const SavedFileShape = z.object({ filename: z.string(), subfolder: z.string(), type: z.string() })
const NodeOutput = z.object({ '3d': z.array(SavedFileShape).optional(), images: z.array(SavedFileShape).optional() })
const Outputs = z.record(z.string(), z.unknown())
const ExecutionError = z.object({ exception_message: z.string() })
const Job = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled']),
  outputs: Outputs.optional(),
  execution_error: ExecutionError.optional()
})
const HistoryEntry = z.object({
  outputs: Outputs.optional(),
  status: z.object({
    status_str: z.string(),
    completed: z.boolean(),
    messages: z.array(z.tuple([z.string(), z.unknown()])).optional()
  })
})
const History = z.record(z.string(), z.unknown())

const cancelled: Failure = { ok: false, reason: 'cancelled', message: 'cancelled' }

function historyJob(entry: unknown): JobView {
  const parsed = HistoryEntry.safeParse(entry)
  if (!parsed.success) return { status: 'pending', outputs: {} }
  const { status, outputs = {} } = parsed.data
  if (status.status_str !== 'error') return { status: status.completed ? 'completed' : 'in_progress', outputs }
  const error = ExecutionError.safeParse(status.messages?.find(([kind]) => kind === 'execution_error')?.[1])
  return { status: 'failed', outputs, error: error.success ? error.data.exception_message : undefined }
}

/** The files written by the workflow node tagged `roomfit:save`. */
export function savedFiles(prompt: ApiWorkflow, outputs: Record<string, unknown>): SavedFile[] {
  const saveId = Object.entries(prompt).find(([, node]) => node._meta?.title === 'roomfit:save')?.[0]
  const output = NodeOutput.safeParse(saveId === undefined ? undefined : outputs[saveId])
  return output.success ? [...(output.data['3d'] ?? []), ...(output.data.images ?? [])] : []
}

/** A client for local ComfyUI and Comfy Cloud v1; every failure comes back as data. */
export function createComfyClient({ baseUrl, fetch: fetcher = fetch, pollMs = 1000 }: { baseUrl: string; fetch?: Fetch; pollMs?: number }) {
  async function reach(path: string, init?: RequestInit): Promise<Reached> {
    try {
      return { ok: true, response: await fetcher(`${baseUrl}${path}`, init) }
    } catch (error) {
      return init?.signal?.aborted ? cancelled : { ok: false, reason: 'unreachable', message: `${baseUrl}${path}: ${String(error)}` }
    }
  }

  async function succeeded(path: string, reached: Reached): Promise<Reached> {
    if (!reached.ok || reached.response.ok) return reached
    const { status } = reached.response
    const message = `${path}: HTTP ${status} ${await reached.response.text().catch(() => '')}`.trim()
    return { ok: false, reason: status === 400 ? 'rejected' : 'http', message }
  }

  async function parsed<T>(path: string, reached: Reached, schema: z.ZodType<T>): Promise<{ ok: true; value: T } | Failure> {
    const answer = await succeeded(path, reached)
    if (!answer.ok) return answer
    const result = schema.safeParse(await answer.response.json().catch(() => undefined))
    return result.success ? { ok: true, value: result.data } : { ok: false, reason: 'http', message: `${path}: unexpected answer` }
  }

  async function poll(id: string, signal?: AbortSignal): Promise<{ ok: true; value: JobView } | Failure> {
    const jobPath = `/api/jobs/${encodeURIComponent(id)}`
    const reached = await reach(jobPath, { signal })
    if (reached.ok && reached.response.status === 404) {
      const historyPath = `/api/history/${encodeURIComponent(id)}`
      const history = await parsed(historyPath, await reach(historyPath, { signal }), History)
      return history.ok ? { ok: true, value: historyJob(history.value[id]) } : history
    }
    const job = await parsed(jobPath, reached, Job)
    if (!job.ok) return job
    const { status, outputs = {}, execution_error } = job.value
    return { ok: true, value: { status, outputs, error: execution_error?.exception_message } }
  }

  return {
    async upload(file: Blob, fileName: string): Promise<{ ok: true; name: string } | Failure> {
      const form = new FormData()
      form.append('image', file, fileName)
      form.append('type', 'input')
      form.append('overwrite', 'true')
      const path = '/api/upload/image'
      const answer = z.object({ name: z.string(), subfolder: z.string().optional() })
      const uploaded = await parsed(path, await reach(path, { method: 'POST', body: form }), answer)
      if (!uploaded.ok) return uploaded
      const { name, subfolder } = uploaded.value
      return { ok: true, name: subfolder ? `${subfolder}/${name}` : name }
    },

    async queue(prompt: ApiWorkflow): Promise<{ ok: true; id: string } | Failure> {
      const path = '/api/prompt'
      const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }
      const queued = await parsed(path, await reach(path, init), z.object({ prompt_id: z.string() }))
      return queued.ok ? { ok: true, id: queued.value.prompt_id } : queued
    },

    async waitForJob(
      id: string,
      { onStatus, signal }: { onStatus?: (status: JobStatus) => void; signal?: AbortSignal } = {}
    ): Promise<{ ok: true; outputs: Record<string, unknown> } | Failure> {
      let last: JobStatus | undefined
      for (;;) {
        if (signal?.aborted) return cancelled
        const polled = await poll(id, signal)
        if (!polled.ok) return polled
        const { status, outputs, error } = polled.value
        if (status !== last) onStatus?.(status)
        last = status
        if (status === 'completed') return { ok: true, outputs }
        if (status === 'failed') return { ok: false, reason: 'failed', message: error ?? 'job failed' }
        if (status === 'cancelled') return { ok: false, reason: 'cancelled', message: 'job cancelled' }
        await new Promise((resolve) => setTimeout(resolve, pollMs))
      }
    },

    async download(file: SavedFile): Promise<{ ok: true; bytes: Uint8Array } | Failure> {
      const path = `/api/view?${new URLSearchParams(file)}`
      const downloaded = await succeeded(path, await reach(path))
      return downloaded.ok ? { ok: true, bytes: new Uint8Array(await downloaded.response.arrayBuffer()) } : downloaded
    }
  }
}

export type ComfyClient = ReturnType<typeof createComfyClient>

/** Median duration in seconds of the finished (done) jobs of a kind, or the documented default before any. */
export function expectedSeconds(jobs: readonly Job[], kind: JobKind): number {
  const durations = jobs
    .filter((job) => job.kind === kind && job.steps.at(-1)?.status === 'done')
    .map(({ steps }) => (steps.at(-1)!.at - steps[0]!.at) / 1000)
    .sort((a, b) => a - b)
  if (durations.length === 0) return DEFAULT_EXPECTED_SECONDS[kind]
  const middle = Math.floor(durations.length / 2)
  return durations.length % 2 === 1 ? durations[middle]! : (durations[middle - 1]! + durations[middle]!) / 2
}
