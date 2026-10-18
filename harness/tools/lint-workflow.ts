import { readFileSync } from 'node:fs'

type InputSpec = [string | string[], Record<string, unknown>?]
type NodeSpec = {
  input: { required?: Record<string, InputSpec>; optional?: Record<string, InputSpec>; hidden?: Record<string, unknown> }
  output: string[]
}
type Snapshot = { classes: string[]; nodes: Record<string, NodeSpec> }
type ApiNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }
export type ApiWorkflow = Record<string, ApiNode>

const isLink = (value: unknown): value is [string, number] =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number'

const accepts = (inputType: string, outputType: string) =>
  inputType === '*' || outputType === '*' || inputType.split(',').includes(outputType)

export function loadSnapshot(path = 'spec/contracts/comfyui-object-info.json'): Snapshot {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function lintWorkflow(workflow: ApiWorkflow, snapshot: Snapshot): string[] {
  const known = new Set(snapshot.classes)
  return Object.entries(workflow).flatMap(([id, node]) => {
    if (!known.has(node.class_type)) return [`${id}: unknown node class "${node.class_type}"`]
    const spec = snapshot.nodes[node.class_type]
    if (!spec) return []
    const declared = { ...spec.input.required, ...spec.input.optional }
    const missing = Object.keys(spec.input.required ?? {})
      .filter((name) => !(name in node.inputs))
      .map((name) => `${id} (${node.class_type}): missing required input "${name}"`)
    const checked = Object.entries(node.inputs).flatMap(([name, value]) => {
      const inputSpec = declared[name]
      if (!inputSpec) return [`${id} (${node.class_type}): unknown input "${name}"`]
      const [type] = inputSpec
      if (isLink(value)) {
        const [sourceId, outputIndex] = value
        const source = workflow[sourceId]
        if (!source) return [`${id}.${name}: links to missing node "${sourceId}"`]
        const sourceSpec = snapshot.nodes[source.class_type]
        if (!sourceSpec) return []
        const outputType = sourceSpec.output[outputIndex]
        if (outputType === undefined) return [`${id}.${name}: ${source.class_type} has no output ${outputIndex}`]
        if (typeof type === 'string' && !accepts(type, outputType)) {
          return [`${id}.${name}: expects ${type} but ${source.class_type} output ${outputIndex} is ${outputType}`]
        }
        return []
      }
      if (Array.isArray(type) && type.length > 0 && !type.includes(value as string)) {
        return [`${id}.${name}: "${String(value)}" is not one of ${type.join(', ')}`]
      }
      return []
    })
    return [...missing, ...checked]
  })
}
