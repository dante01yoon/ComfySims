import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const GLB = readFileSync(new URL('../../fixtures/glb/generated-offset-box.glb', import.meta.url))
const PHOTO3D_GLB = readFileSync(new URL('../../fixtures/glb/photo3d-plane.glb', import.meta.url))
const PANORAMA = readFileSync(new URL('../../fixtures/images/pano-bedroom.png', import.meta.url))
const snapshotAt = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
const LOCAL_WITHOUT = ['LoadMoGeModel', 'MoGeInference', 'MoGePointMapToMesh']

/** /api/object_info as a backend would serve it: `cloud` from the Cloud snapshot; `local` from the local snapshot without MoGe nodes and with only an SDXL ControlNet installed. */
function catalogOf(kind) {
  const snapshot = snapshotAt(kind === 'local' ? 'spec/contracts/comfyui-object-info.json' : 'spec/contracts/comfy-cloud-object-info.json')
  const classes = snapshot.classes.filter((name) => kind !== 'local' || !LOCAL_WITHOUT.includes(name))
  const catalog = Object.fromEntries(classes.map((name) => [name, snapshot.nodes[name] ?? { input: { required: {} }, output: [] }]))
  if (kind === 'local') {
    catalog.ControlNetLoader = structuredClone(catalog.ControlNetLoader)
    catalog.ControlNetLoader.input.required.control_net_name = [['controlnet-depth-sdxl-1.0.safetensors']]
  }
  return catalog
}
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

/** A ComfyUI/Comfy Cloud stand-in for the harness: records every request and answers like Cloud's v1 API. */
export function startFakeComfy({ port = 8199, storagePort = 8197, failJobs = false, requireKey = null, catalog = 'cloud' } = {}) {
  const objectInfo = catalogOf(catalog)
  let lastPrompt = null
  const requests = []
  const prompts = new Map()
  const uploadNames = new Map()
  let uploads = 0
  let jobs = 0

  const storage = createServer((request, response) => {
    requests.push({ server: 'storage', method: request.method, url: request.url, headers: request.headers })
    const isGlb = request.url.includes('.glb')
    response.setHeader('Content-Type', isGlb ? 'model/gltf-binary' : 'image/png')
    response.end(isGlb ? (request.url.includes('photo3d') ? PHOTO3D_GLB : GLB) : request.url.includes('pano360') ? PANORAMA : PNG)
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
    if (url.pathname === '/__prompts') return json(200, [...prompts.entries()].map(([id, entry]) => ({ id, images: Object.values(entry.prompt).filter((node) => node.class_type === 'LoadImage').map((node) => node.inputs.image), savePrefix: Object.values(entry.prompt).find((node) => node._meta?.title === 'roomfit:save')?.inputs.filename_prefix ?? null, positive: Object.values(entry.prompt).find((node) => node._meta?.title === 'roomfit:positive')?.inputs.text ?? null })))
    if (url.pathname === '/__last-prompt') return json(200, lastPrompt)
    if (requireKey && request.headers['x-api-key'] !== requireKey) return json(401, { error: 'unauthorized' })
    if (request.method === 'GET' && url.pathname === '/api/object_info') return json(200, objectInfo)

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
      lastPrompt = prompt
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
      const isPhoto3d = String(saveNode.inputs?.filename_prefix ?? '').includes('photo3d')
      const isPanorama = String(saveNode.inputs?.filename_prefix ?? '').includes('pano360')
      const file = { filename: isGlb ? (isPhoto3d ? 'photo3d_00001_.glb' : 'product_00001_.glb') : isPanorama ? 'pano360_00001_.png' : 'render_00001_.png', subfolder: 'roomfit', type: 'output' }
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
  const port = Number(process.env.FAKE_COMFY_PORT ?? 8199)
  const storagePort = Number(process.env.FAKE_COMFY_STORAGE_PORT ?? 8197)
  await startFakeComfy({ port, storagePort, requireKey: process.env.FAKE_COMFY_REQUIRE_KEY ?? null, catalog: process.env.FAKE_COMFY_CATALOG ?? 'cloud' })
  console.log(`fake comfy on http://127.0.0.1:${port} (storage :${storagePort})`)
}
