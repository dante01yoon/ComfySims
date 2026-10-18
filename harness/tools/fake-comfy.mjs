import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const GLB = readFileSync(new URL('../../fixtures/glb/generated-offset-box.glb', import.meta.url))
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

/** A ComfyUI/Comfy Cloud stand-in for the harness: records every request and answers like Cloud's v1 API. */
export function startFakeComfy({ port = 8199, storagePort = 8197, failJobs = false, requireKey = null } = {}) {
  const requests = []
  const prompts = new Map()
  const uploadNames = new Map()
  let uploads = 0
  let jobs = 0

  const storage = createServer((request, response) => {
    requests.push({ server: 'storage', method: request.method, url: request.url, headers: request.headers })
    const isGlb = request.url.includes('.glb')
    response.setHeader('Content-Type', isGlb ? 'model/gltf-binary' : 'image/png')
    response.end(isGlb ? GLB : PNG)
  })

  const api = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    requests.push({ server: 'api', method: request.method, url: request.url, headers: request.headers, body: body.toString('latin1') })
    const url = new URL(request.url, 'http://fake')
    const json = (status, value) => {
      response.statusCode = status
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify(value))
    }

    if (url.pathname === '/__requests') return json(200, requests.filter((entry) => entry.url !== '/__requests').map(({ body, ...entry }) => entry))
    if (requireKey && request.headers['x-api-key'] !== requireKey) return json(401, { error: 'unauthorized' })

    if (request.method === 'POST' && url.pathname === '/api/upload/image') {
      uploads += 1
      const original = body.toString('latin1').match(/filename="([^"]+)"/)?.[1] ?? ''
      const name = `${original.includes('fail') ? 'fail-' : original.includes('slow') ? 'slow-' : ''}upload-${uploads}.png`
      uploadNames.set(name, original)
      return json(200, { name, subfolder: '', type: 'input' })
    }
    if (request.method === 'POST' && url.pathname === '/api/prompt') {
      jobs += 1
      const id = `job-${jobs}`
      const prompt = JSON.parse(body.toString('utf8')).prompt
      prompts.set(id, { prompt, polls: 0, createdAt: Date.now(), slow: JSON.stringify(prompt).includes('slow-upload') })
      return json(200, { prompt_id: id, number: jobs })
    }
    const job = url.pathname.match(/^\/api\/jobs\/([^/]+)$/)
    if (request.method === 'GET' && job) {
      const entry = prompts.get(job[1])
      if (!entry) return json(404, { error: 'not found' })
      entry.polls += 1
      if (entry.polls < 2 || (entry.slow && Date.now() - entry.createdAt < 8000)) return json(200, { id: job[1], status: 'in_progress', create_time: 0, update_time: 0 })
      if (failJobs || JSON.stringify(entry.prompt).includes('fail-upload')) {
        return json(200, { id: job[1], status: 'failed', create_time: 0, update_time: 0, execution_error: { node_id: '3', node_type: 'KSampler', exception_message: 'out of memory', exception_type: 'RuntimeError', traceback: [], current_inputs: {}, current_outputs: {} } })
      }
      const save = Object.entries(entry.prompt).find(([, node]) => node._meta?.title === 'roomfit:save')
      const [saveId, saveNode] = save ?? ['0', { class_type: 'SaveImage' }]
      const isGlb = saveNode.class_type === 'SaveGLB'
      const file = { filename: isGlb ? 'product_00001_.glb' : 'render_00001_.png', subfolder: 'roomfit', type: 'output' }
      return json(200, { id: job[1], status: 'completed', create_time: 0, update_time: 0, outputs: { [saveId]: isGlb ? { '3d': [file] } : { images: [file] } } })
    }
    if (request.method === 'GET' && url.pathname === '/api/view') {
      response.statusCode = 302
      response.setHeader('Location', `http://127.0.0.1:${storagePort}/signed/${url.searchParams.get('filename')}?sig=abc`)
      return response.end()
    }
    json(404, { error: `no fake for ${request.method} ${url.pathname}` })
  })

  return new Promise((resolve) => {
    storage.listen(storagePort, '127.0.0.1', () =>
      api.listen(port, '127.0.0.1', () =>
        resolve({
          requests,
          prompts,
          close: () => new Promise((done) => api.close(() => storage.close(() => done())))
        })
      )
    )
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startFakeComfy({ requireKey: process.env.FAKE_COMFY_REQUIRE_KEY ?? null })
  console.log('fake comfy on http://127.0.0.1:8199 (storage :8197)')
}
