import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { parseLayout } from '../packages/schema/src/index.ts'

const house = JSON.parse(readFileSync('fixtures/layouts/demo-house.json', 'utf8'))
const render = JSON.parse(readFileSync('workflows/render-from-depth.json', 'utf8'))

describe('AC-94 layouts carry workflow and model choices', () => {
  it('AC-94 accepts generation choices and custom workflows', () => {
    const layout = { ...house, generation: { render: { workflow: 'custom:fast', models: { '1.unet_name': 'other.safetensors' } }, product: { workflow: 'cloud/product-to-glb-pixal3d.json' } }, customWorkflows: { fast: { kind: 'render', graph: render } } }
    expect(parseLayout(layout).ok).toBe(true)
  })

  it.for([
    { name: 'an unknown job kind', change: { generation: { video: { workflow: 'x.json' } } } },
    { name: 'eleven custom workflows', change: { customWorkflows: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`w${i}`, { kind: 'render', graph: render }])) } },
    { name: 'a custom workflow that is not an API graph', change: { customWorkflows: { bad: { kind: 'render', graph: { nodes: [] } } } } }
  ])('AC-94 rejects $name', ({ change }) => {
    expect(parseLayout({ ...house, ...change }).ok).toBe(false)
  })

  it('AC-94 loads layouts without choices', () => {
    expect(parseLayout(house).ok).toBe(true)
  })
})
