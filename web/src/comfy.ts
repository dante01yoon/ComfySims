import { createComfyClient, savedFiles, type Failure, type PromptOutcome, type SavedFile } from '../../packages/comfy/src/index.ts'
import type { ComfyJob } from '../../spec/contracts/editor-api.ts'

const COMFY_OUTPUT = 'comfy-output:'

export const comfy = createComfyClient({ baseUrl: location.pathname.startsWith('/roomfit/') ? '' : '/comfy' })

export function comfyOutputUri({ subfolder, filename }: SavedFile): string {
  return `${COMFY_OUTPUT}${subfolder ? `${subfolder}/` : ''}${filename}`
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

/** Uploads an input, runs the workflow built for it and downloads the file it saved, reporting each status. */
export async function generate(
  kind: ComfyJob['kind'],
  report: (job: ComfyJob) => void,
  input: { file: Blob; fileName: string },
  build: (uploadedName: string) => PromptOutcome
): Promise<{ ok: true; bytes: Uint8Array; file: SavedFile } | Failure> {
  const fail = (failure: Failure): Failure => {
    report({ kind, status: 'failed', message: failure.message })
    return failure
  }
  report({ kind, status: 'uploading' })
  const uploaded = await comfy.upload(input.file, input.fileName)
  if (!uploaded.ok) return fail(uploaded)
  const built = build(uploaded.name)
  if (!built.ok) return fail({ ok: false, reason: 'rejected', message: `the workflow is missing ${built.missing.join(', ')}` })
  const queued = await comfy.queue(built.prompt)
  if (!queued.ok) return fail(queued)
  report({ kind, status: 'queued' })
  const finished = await comfy.waitForJob(queued.id, {
    onStatus: (status) => {
      if (status === 'in_progress') report({ kind, status })
    }
  })
  if (!finished.ok) return fail(finished)
  const [file] = savedFiles(built.prompt, finished.outputs)
  if (!file) return fail({ ok: false, reason: 'failed', message: 'the workflow saved no file' })
  report({ kind, status: 'downloading' })
  const downloaded = await comfy.download(file)
  return downloaded.ok ? { ok: true, bytes: downloaded.bytes, file } : fail(downloaded)
}
