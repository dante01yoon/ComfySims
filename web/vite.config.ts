import { createReadStream, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

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

function proxyComfy({ target, apiKey }: { target: string; apiKey: string | undefined }): Plugin {
  return {
    name: 'roomfit-comfy-proxy',
    configureServer(server) {
      server.middlewares.use('/comfy', async (request, response) => {
        try {
          const headers = new Headers(apiKey ? { 'X-API-Key': apiKey } : {})
          if (request.headers['content-type']) headers.set('Content-Type', request.headers['content-type'])
          const upstream = await fetch(new URL(request.url ?? '/', target), {
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
      proxyComfy({ target: env.ROOMFIT_COMFY_URL || 'http://127.0.0.1:8188', apiKey: env.COMFY_CLOUD_API_KEY || undefined })
    ],
    server: { host: '127.0.0.1' }
  }
})
