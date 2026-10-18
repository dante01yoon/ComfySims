import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const contract: { tools: Record<string, { required: string[]; properties: Record<string, string> }> } = JSON.parse(readFileSync('spec/contracts/mcp-tools.json', 'utf8'))
let client: Client

type Schema = { type?: string | string[]; anyOf?: Schema[] }
const typesOf = (schema: Schema): string[] => [
  ...(Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []),
  ...(schema.anyOf ?? []).flatMap(typesOf)
]

beforeAll(async () => {
  client = new Client({ name: 'roomfit-contract-test', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: 'pnpm', args: ['-s', 'mcp'], env: { ...process.env, ROOMFIT_URL: 'http://127.0.0.1:5998' } as Record<string, string> }))
}, 60_000)
afterAll(() => client?.close())

describe('AC-56 the roomfit MCP server serves the contracted tools', () => {
  it('AC-56 lists exactly the tools in spec/contracts/mcp-tools.json with matching inputs', async () => {
    const { tools } = await client.listTools()

    expect(tools.map((tool) => tool.name).sort()).toEqual(Object.keys(contract.tools).sort())
    for (const tool of tools) {
      const expected = contract.tools[tool.name]!
      const schema = tool.inputSchema as { required?: string[]; properties?: Record<string, Schema> }
      expect([...(schema.required ?? [])].sort(), tool.name).toEqual([...expected.required].sort())
      expect(Object.keys(schema.properties ?? {}).sort(), tool.name).toEqual(Object.keys(expected.properties).sort())
      for (const [name, type] of Object.entries(expected.properties)) {
        expect(typesOf(schema.properties![name]!), `${tool.name}.${name}`).toContain(type)
      }
      expect(tool.description?.length ?? 0, tool.name).toBeGreaterThan(20)
    }
  })
})

describe('AC-60 without an editor', () => {
  it('AC-60 every tool reports that no editor is connected', async () => {
    for (const name of ['get_house', 'screenshot', 'list_assets']) {
      const result = await client.callTool({ name, arguments: {} })
      expect(result.isError, name).toBe(true)
      expect((result.content as { text: string }[])[0]!.text, name).toMatch(/^No roomfit editor is connected/)
    }
  })
})
