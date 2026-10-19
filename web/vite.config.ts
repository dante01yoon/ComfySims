import { createReadStream, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

import { bridge, isLocal } from './bridge.ts'
import { fetchImage } from './fetch-image.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url))

function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
}

function serveFixtures(): Plugin {
  return {
    name: 'roomfit-fixtures',
    configureServer(server) {
      server.middlewares.use('/fixtures', (request, response) => {
        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://fixtures').pathname)
        const file = resolve(fixturesDir, `.${pathname}`)
        if (!file.startsWith(fixturesDir + sep) || !isFile(file)) {
          response.statusCode = 404
          response.end()
          return
        }
        createReadStream(file).pipe(response)
      })
    }
  }
}

async function bodyOf(request: IncomingMessage): Promise<Blob | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const chunks: Uint8Array<ArrayBuffer>[] = []
  for await (const chunk of request) chunks.push(new Uint8Array(chunk))
  return new Blob(chunks)
}

async function sendBack(upstream: Response, response: ServerResponse): Promise<void> {
  response.statusCode = upstream.status
  const contentType = upstream.headers.get('content-type')
  if (contentType) response.setHeader('Content-Type', contentType)
  response.end(Buffer.from(await upstream.arrayBuffer()))
}

type BackendKind = 'local' | 'cloud'
type Backends = { cloudUrl: string; localUrl: string; startUrl: string; apiKey: string | undefined }

function isBackendKind(kind: unknown): kind is BackendKind {
  return kind === 'local' || kind === 'cloud'
}

function isHttpUrl(url: unknown): url is string {
  return typeof url === 'string' && URL.canParse(url) && ['http:', 'https:'].includes(new URL(url).protocol)
}

function choiceOf(text: string): { kind: BackendKind; url?: string } | null {
  try {
    const { kind, url }: { kind?: unknown; url?: unknown } = JSON.parse(text)
    if (!isBackendKind(kind) || (url !== undefined && !isHttpUrl(url))) return null
    return url === undefined ? { kind } : { kind, url }
  } catch {
    return null
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

function routeOf(url: string, current: BackendKind): { kind: BackendKind; path: string } {
  const pinned = /^\/(local|cloud)(\/.*)$/.exec(url)
  return pinned && isBackendKind(pinned[1]) ? { kind: pinned[1], path: pinned[2] ?? '/' } : { kind: current, path: url }
}

function comfyBackends({ cloudUrl, localUrl, startUrl, apiKey }: Backends): Plugin {
  let current: BackendKind = startUrl === cloudUrl ? 'cloud' : 'local'
  let local = current === 'local' ? startUrl : localUrl
  const targetOf = (kind: BackendKind) => (kind === 'cloud' ? cloudUrl : local)
  const view = () => ({ kind: current, url: targetOf(current), localUrl: local, cloudConfigured: apiKey !== undefined })
  return {
    name: 'roomfit-comfy-backends',
    configureServer(server) {
      server.middlewares.use('/__roomfit/backend', async (request, response) => {
        if (!isLocal(request)) return sendJson(response, 403, { error: 'the backend can only be changed from the roomfit editor' })
        if (request.method === 'POST') {
          const choice = choiceOf(await (await bodyOf(request))?.text() ?? '')
          if (!choice) return sendJson(response, 400, { error: 'expected { kind: "local" | "cloud", url?: "http(s)://…" }' })
          if (choice.kind === 'cloud' && !apiKey) return sendJson(response, 409, { error: 'No Cloud key in .env.local' })
          current = choice.kind
          if (choice.kind === 'local' && choice.url) local = choice.url
        }
        sendJson(response, 200, view())
      })

      server.middlewares.use('/__roomfit/fetch-image', async (request, response) => {
        if (!isLocal(request)) return sendJson(response, 403, { error: 'photos can only be fetched for the roomfit editor' })
        const fetched = await fetchImage(new URL(request.url ?? '/', 'http://editor').searchParams.get('url') ?? '')
        if (!fetched.ok) return sendJson(response, fetched.status, { error: fetched.message })
        response.setHeader('Content-Type', fetched.contentType)
        response.end(fetched.bytes)
      })

      server.middlewares.use('/comfy', async (request, response) => {
        const { kind, path } = routeOf(request.url ?? '/', current)
        const target = targetOf(kind)
        try {
          const headers = new Headers(kind === 'cloud' && apiKey ? { 'X-API-Key': apiKey } : {})
          if (request.headers['content-type']) headers.set('Content-Type', request.headers['content-type'])
          const upstream = await fetch(new URL(path, target), {
            method: request.method,
            headers,
            body: await bodyOf(request),
            redirect: 'manual'
          })
          const location = upstream.headers.get('location')
          const signedStorage = upstream.status >= 300 && upstream.status < 400 && location
          await sendBack(signedStorage ? await fetch(new URL(location, target)) : upstream, response)
        } catch (error) {
          response.statusCode = 502
          response.end(`ComfyUI at ${target} is unreachable: ${String(error)}`)
        }
      })
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  return {
    plugins: [
      react(),
      serveFixtures(),
      comfyBackends({
        cloudUrl: env.ROOMFIT_CLOUD_URL || 'https://cloud.comfy.org',
        localUrl: env.ROOMFIT_LOCAL_URL || 'http://127.0.0.1:8188',
        startUrl: env.ROOMFIT_COMFY_URL || env.ROOMFIT_LOCAL_URL || 'http://127.0.0.1:8188',
        apiKey: env.COMFY_CLOUD_API_KEY || undefined
      }),
      bridge({ tokenFile: resolve(repoRoot, '.harness/bridge-token') })
    ],
    server: { host: '127.0.0.1' }
  }
})
