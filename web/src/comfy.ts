import { createComfyClient, savedFiles, type ComfyClient, type Failure, type PromptOutcome, type SavedFile } from '../../packages/comfy/src/index.ts'
import type { ApiWorkflow } from '../../harness/tools/lint-workflow.ts'
import type { BackendKind, JobStep } from '../../packages/schema/src/index.ts'

const COMFY_OUTPUT = 'comfy-output:'
const servedByComfyUI = location.pathname.startsWith('/roomfit/')

const clients: Record<BackendKind, ComfyClient> = {
  local: createComfyClient({ baseUrl: servedByComfyUI ? '' : '/comfy/local' }),
  cloud: createComfyClient({ baseUrl: servedByComfyUI ? '' : '/comfy/cloud' })
}
const currentBackendClient = createComfyClient({ baseUrl: servedByComfyUI ? '' : '/comfy' })
const outputBackends = new Map<string, BackendKind>()

/** The ComfyUI client whose requests all go to one backend through the dev server. */
export function comfyOn(backend: BackendKind): ComfyClient {
  return clients[backend]
}

/** The client for the backend that made a `comfy-output:` uri in this session, else for the dev server's current backend. */
export function comfyHolding(uri: string): ComfyClient {
  const backend = outputBackends.get(uri)
  return backend ? clients[backend] : currentBackendClient
}

/** Where `/api/object_info` of a backend is reachable from the browser. */
export function catalogUrl(backend: BackendKind): string {
  return servedByComfyUI ? '/api/object_info' : `/comfy/${backend}/api/object_info`
}

export function comfyOutputUri({ subfolder, filename }: SavedFile, backend?: BackendKind): string {
  const uri = `${COMFY_OUTPUT}${subfolder ? `${subfolder}/` : ''}${filename}`
  if (backend) outputBackends.set(uri, backend)
  return uri
}

/** The ComfyUI output file a `comfy-output:` asset uri points to, or null for any other uri. */
export function comfyOutputFile(uri: string): SavedFile | null {
  if (!uri.startsWith(COMFY_OUTPUT)) return null
  const path = uri.slice(COMFY_OUTPUT.length)
  const slash = path.lastIndexOf('/')
  return { subfolder: slash < 0 ? '' : path.slice(0, slash), filename: path.slice(slash + 1), type: 'output' }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

export type ComfyInput = { file: Blob; fileName: string } | { imageName: string }

/** One job's link to ComfyUI: the backend it is pinned to, its progress, and where the submitted graph is recorded. */
export type ComfyRun = { comfy: ComfyClient; step: (status: JobStep) => void; submitted: (prompt: ApiWorkflow) => void }

async function inputName({ comfy, step }: ComfyRun, input: ComfyInput): Promise<{ ok: true; name: string } | Failure> {
  if ('imageName' in input) return { ok: true, name: input.imageName }
  step('uploading')
  return comfy.upload(input.file, input.fileName)
}

/** Uploads an input (unless it already is a ComfyUI input), runs the workflow built for it and downloads the file it saved, reporting each step. */
export async function generate(
  run: ComfyRun,
  input: ComfyInput,
  build: (uploadedName: string) => PromptOutcome
): Promise<{ ok: true; bytes: Uint8Array; file: SavedFile } | Failure> {
  const { comfy, step } = run
  const uploaded = await inputName(run, input)
  if (!uploaded.ok) return uploaded
  const built = build(uploaded.name)
  if (!built.ok) return { ok: false, reason: 'rejected', message: `the workflow is missing ${built.missing.join(', ')}` }
  run.submitted(built.prompt)
  const queued = await comfy.queue(built.prompt)
  if (!queued.ok) return queued
  step('queued')
  const finished = await comfy.waitForJob(queued.id, {
    onStatus: (status) => {
      if (status === 'in_progress') step('generating')
    }
  })
  if (!finished.ok) return finished
  const [file] = savedFiles(built.prompt, finished.outputs)
  if (!file) return { ok: false, reason: 'failed', message: 'the workflow saved no file' }
  step('downloading')
  const downloaded = await comfy.download(file)
  return downloaded.ok ? { ok: true, bytes: downloaded.bytes, file } : downloaded
}
