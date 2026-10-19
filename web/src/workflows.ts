import type { ApiWorkflow } from '../../harness/tools/lint-workflow.ts'
import { inputOptions, missingFromCatalog } from '../../packages/comfy/src/index.ts'
import type { BackendKind, JobKind, RoomLayout } from '../../packages/schema/src/index.ts'
import type { BackendState, ModelSlot, WorkflowChoice, WorkflowOption } from '../../spec/contracts/editor-api.ts'
import cloudPanorama from '../../workflows/cloud/pano360-from-depth.json'
import cloudPhoto from '../../workflows/cloud/photo-to-3d-moge.json'
import cloudProduct from '../../workflows/cloud/product-to-glb-pixal3d.json'
import localPhoto from '../../workflows/local/photo-to-3d-moge.json'
import localProduct from '../../workflows/product-to-glb.json'
import renderWorkflow from '../../workflows/render-from-depth.json'
import workflowSets from '../../workflows/sets.json'

export type Catalog = Record<string, unknown>
export type ChosenWorkflow = { id: string; graph: ApiWorkflow | undefined }

export const JOB_KINDS: readonly JobKind[] = ['product', 'render', 'photo3d', 'pano360']
export const MAX_CUSTOM_WORKFLOWS = 10
export const CUSTOM_PREFIX = 'custom:'

const BUILTIN_WORKFLOWS: Record<string, ApiWorkflow> = {
  'cloud/pano360-from-depth.json': cloudPanorama,
  'cloud/photo-to-3d-moge.json': cloudPhoto,
  'cloud/product-to-glb-pixal3d.json': cloudProduct,
  'local/photo-to-3d-moge.json': localPhoto,
  'product-to-glb.json': localProduct,
  'render-from-depth.json': renderWorkflow
}
const DEPTH_RENDER_TAGS = ['roomfit:depth', 'roomfit:positive', 'roomfit:negative', 'roomfit:seed', 'roomfit:save']
const REQUIRED_TAGS: Record<JobKind, readonly string[]> = {
  product: ['roomfit:product-image', 'roomfit:save'],
  photo3d: ['roomfit:photo', 'roomfit:save'],
  render: DEPTH_RENDER_TAGS,
  pano360: DEPTH_RENDER_TAGS
}

function builtinIds(kind: JobKind): string[] {
  return [...new Set([workflowSets.local[kind], workflowSets.cloud[kind]])]
}

function customName(id: string): string | undefined {
  return id.startsWith(CUSTOM_PREFIX) ? id.slice(CUSTOM_PREFIX.length) : undefined
}

function customOf(layout: RoomLayout, id: string) {
  const name = customName(id)
  return name === undefined ? undefined : layout.customWorkflows?.[name]
}

function templateOf(layout: RoomLayout, id: string): ApiWorkflow | undefined {
  return customName(id) === undefined ? BUILTIN_WORKFLOWS[id] : customOf(layout, id)?.graph
}

function withModels(graph: ApiWorkflow, models: Record<string, string>): ApiWorkflow {
  const chosen = structuredClone(graph)
  for (const [key, value] of Object.entries(models)) {
    const dot = key.lastIndexOf('.')
    const node = chosen[key.slice(0, dot)]
    if (node) node.inputs[key.slice(dot + 1)] = value
  }
  return chosen
}

/** The tags a job kind's workflow lacks. */
export function missingTags(kind: JobKind, graph: ApiWorkflow): string[] {
  const titles = new Set(Object.values(graph).map((node) => node._meta?.title))
  return REQUIRED_TAGS[kind].filter((tag) => !titles.has(tag))
}

/** The job kind a workflow id is made for, or undefined when no such workflow exists. */
export function workflowKindOf(layout: RoomLayout, id: string): JobKind | undefined {
  return customName(id) === undefined ? JOB_KINDS.find((kind) => builtinIds(kind).includes(id)) : customOf(layout, id)?.kind
}

/** The workflow a job kind runs on a backend (the layout's choice, else `sets.json`), with the layout's model choices applied. */
export function chosenWorkflow(layout: RoomLayout, backend: BackendKind, kind: JobKind): ChosenWorkflow {
  const choice = layout.generation?.[kind]
  const id = choice?.workflow ?? workflowSets[backend][kind]
  const template = templateOf(layout, id)
  return { id, graph: template && withModels(template, choice?.models ?? {}) }
}

function missingOn(graph: ApiWorkflow | undefined, id: string, backend: BackendKind, catalog: Catalog | null): string[] {
  if (!graph) return [id]
  return catalog ? missingFromCatalog(graph, catalog, backend) : []
}

/** The job kinds whose chosen workflow the backend's catalog cannot run, with what it lacks; none until the catalog is read. */
export function unavailableJobs(layout: RoomLayout, backend: BackendKind, catalog: Catalog | null): BackendState['unavailable'] {
  if (!catalog) return []
  return JOB_KINDS.flatMap((kind) => {
    const { id, graph } = chosenWorkflow(layout, backend, kind)
    const missing = missingOn(graph, id, backend, catalog)
    return missing.length > 0 ? [{ kind, missing }] : []
  })
}

function modelSlots(graph: ApiWorkflow, template: ApiWorkflow, catalog: Catalog): ModelSlot[] {
  return Object.entries(graph).flatMap(([nodeId, node]) =>
    Object.entries(node.inputs).flatMap(([input, value]) => {
      if (typeof value !== 'string' || !(input === 'name' || input.endsWith('_name'))) return []
      const options = inputOptions(catalog, node.class_type, input)
      if (!options) return []
      const own = template[nodeId]?.inputs[input]
      const listed = [...options, own, value].filter((option): option is string => typeof option === 'string')
      return [{ key: `${nodeId}.${input}`, label: `${node._meta?.title ?? node.class_type} · ${input}`, value, options: [...new Set(listed)] }]
    })
  )
}

function optionLabel(id: string): string {
  const name = customName(id)
  return name === undefined ? id : `Custom · ${name}`
}

/** The workflow a job kind will use, the built-in and custom alternatives with availability, and its model slots. */
export function workflowChoiceOf(layout: RoomLayout, backend: BackendKind, catalog: Catalog | null, kind: JobKind): WorkflowChoice {
  const chosen = chosenWorkflow(layout, backend, kind)
  const customIds = Object.entries(layout.customWorkflows ?? {}).flatMap(([name, custom]) => (custom.kind === kind ? [`${CUSTOM_PREFIX}${name}`] : []))
  const options = [...new Set([...builtinIds(kind), ...customIds, chosen.id])].map((id): WorkflowOption => {
    const missing = missingOn(id === chosen.id ? chosen.graph : templateOf(layout, id), id, backend, catalog)
    return { id, label: optionLabel(id), source: customName(id) === undefined ? 'builtin' : 'custom', available: missing.length === 0, missing }
  })
  const template = templateOf(layout, chosen.id)
  const models = chosen.graph && template && catalog ? modelSlots(chosen.graph, template, catalog) : []
  return { kind, current: chosen.id, options, models }
}
