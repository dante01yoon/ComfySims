import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { missingFromCatalog } from '../packages/comfy/src/index.ts'

type ApiWorkflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>
const sets: Record<'local' | 'cloud', Record<string, string>> = JSON.parse(readFileSync('workflows/sets.json', 'utf8'))
const noModels: Record<string, unknown> = JSON.parse(readFileSync('fixtures/catalogs/comfyui-no-models.json', 'utf8'))
const cloudLive: Record<string, unknown> = JSON.parse(readFileSync('fixtures/catalogs/comfy-cloud-live.json', 'utf8'))
type CatalogNode = { input?: { required?: Record<string, unknown[]>; optional?: Record<string, unknown[]> } }
const emptyOptionList = (className: string, inputName: string) => {
  const node = noModels[className] as CatalogNode | undefined
  const spec = node?.input?.required?.[inputName] ?? node?.input?.optional?.[inputName]
  const extra = spec?.[1] as { image_upload?: boolean; options?: unknown[] } | undefined
  const options = Array.isArray(spec?.[0]) ? spec[0] : spec?.[0] === 'COMBO' ? extra?.options : undefined
  return Array.isArray(options) && options.length === 0 && extra?.image_upload !== true
}
const modelFilesOf = (workflow: ApiWorkflow) =>
  Object.values(workflow).flatMap((node) => Object.entries(node.inputs).filter(([name, value]) => typeof value === 'string' && emptyOptionList(node.class_type, name)).map(([, value]) => value as string))

describe('AC-72 readiness against a real ComfyUI with no models installed', () => {
  it.for(Object.entries(sets.local))('AC-72 local %s is unavailable and names every model file it needs', ([, file]) => {
    const workflow: ApiWorkflow = JSON.parse(readFileSync(`workflows/${file}`, 'utf8'))
    const missing = missingFromCatalog(workflow, noModels, 'local')

    expect(modelFilesOf(workflow).length).toBeGreaterThan(0)
    expect(missing).toEqual(expect.arrayContaining(modelFilesOf(workflow)))
  })

  it('AC-72 an uploaded image name is not a model file', () => {
    const workflow: ApiWorkflow = JSON.parse(readFileSync(`workflows/${sets.local.photo3d}`, 'utf8'))
    expect(missingFromCatalog(workflow, noModels, 'local')).not.toContain('roomfit-photo.png')
  })
})

describe('AC-72 readiness against the real Comfy Cloud catalog', () => {
  it.for(Object.entries(sets.cloud))('AC-72 cloud %s is ready: Cloud runs model files its catalog does not list, so only node classes count', ([, file]) => {
    const workflow: ApiWorkflow = JSON.parse(readFileSync(`workflows/${file}`, 'utf8'))
    expect(missingFromCatalog(workflow, cloudLive, 'cloud')).toEqual([])
  })

  it('AC-72 the Cloud catalog really omits model files that Cloud runs (why the rule differs)', () => {
    const workflow: ApiWorkflow = JSON.parse(readFileSync(`workflows/${sets.cloud.product}`, 'utf8'))
    expect(missingFromCatalog(workflow, cloudLive, 'local')).toContain('pixal3d_int8_convrot.safetensors')
  })

  it('AC-72 a node class Cloud lacks still makes a kind unavailable', () => {
    const workflow: ApiWorkflow = { '1': { class_type: 'NoSuchNode', inputs: {} } }
    expect(missingFromCatalog(workflow, cloudLive, 'cloud')).toEqual(['NoSuchNode'])
  })
})
