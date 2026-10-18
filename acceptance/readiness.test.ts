import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { missingFromCatalog } from '../packages/comfy/src/index.ts'

type ApiWorkflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>
const sets: Record<'local' | 'cloud', Record<string, string>> = JSON.parse(readFileSync('workflows/sets.json', 'utf8'))
const noModels: Record<string, unknown> = JSON.parse(readFileSync('fixtures/catalogs/comfyui-no-models.json', 'utf8'))
type CatalogNode = { input?: { required?: Record<string, unknown[]>; optional?: Record<string, unknown[]> } }
const emptyOptionList = (className: string, inputName: string) => {
  const node = noModels[className] as CatalogNode | undefined
  const spec = node?.input?.required?.[inputName] ?? node?.input?.optional?.[inputName]
  const isUpload = (spec?.[1] as { image_upload?: boolean } | undefined)?.image_upload === true
  return Array.isArray(spec?.[0]) && spec[0].length === 0 && !isUpload
}
const modelFilesOf = (workflow: ApiWorkflow) =>
  Object.values(workflow).flatMap((node) => Object.entries(node.inputs).filter(([name, value]) => typeof value === 'string' && emptyOptionList(node.class_type, name)).map(([, value]) => value as string))

describe('AC-72 readiness against a real ComfyUI with no models installed', () => {
  it.for(Object.entries(sets.local))('AC-72 local %s is unavailable and names every model file it needs', ([, file]) => {
    const workflow: ApiWorkflow = JSON.parse(readFileSync(`workflows/${file}`, 'utf8'))
    const missing = missingFromCatalog(workflow, noModels)

    expect(modelFilesOf(workflow).length).toBeGreaterThan(0)
    expect(missing).toEqual(expect.arrayContaining(modelFilesOf(workflow)))
  })

  it('AC-72 an uploaded image name is not a model file', () => {
    const workflow: ApiWorkflow = JSON.parse(readFileSync(`workflows/${sets.local.photo3d}`, 'utf8'))
    expect(missingFromCatalog(workflow, noModels)).not.toContain('roomfit-photo.png')
  })
})
