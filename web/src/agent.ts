import { api, setAgentConnected } from './editor.ts'
import { base64Of } from './workspace.tsx'

const BRIDGE_PATH = '/__roomfit-bridge'

type Call = { id: number; method: string; params: unknown[]; label?: string }
type Notice = { agents: number }

const methods = {
  ...api,
  base64At: async (url: string) => base64Of(await (await fetch(url)).blob())
}

function isMethod(name: string): name is keyof typeof methods {
  return Object.hasOwn(methods, name)
}

function invoke({ method, params, label }: Call): unknown {
  if (!isMethod(method)) throw new Error(`the editor has no method ${method}`)
  api.setActionLabel(label ?? null)
  try {
    return Reflect.apply(methods[method], api, params)
  } finally {
    api.setActionLabel(null)
  }
}

async function answer(socket: WebSocket, call: Call): Promise<void> {
  try {
    socket.send(JSON.stringify({ id: call.id, result: await invoke(call) }))
  } catch (error) {
    socket.send(JSON.stringify({ id: call.id, error: { message: error instanceof Error ? error.message : String(error) } }))
  }
}

/** Connects this tab to the dev server's agent bridge so MCP tools act on it; does nothing where no bridge is served. */
export async function connectBridge(): Promise<void> {
  const response = await fetch(`${BRIDGE_PATH}/token`).catch(() => null)
  if (!response?.ok) return
  const token = await response.text()
  const socket = new WebSocket(`ws://${location.host}${BRIDGE_PATH}?role=editor&token=${token}`)
  socket.onmessage = (event: MessageEvent<string>) => {
    const message: Call | Notice = JSON.parse(event.data)
    if ('agents' in message) setAgentConnected(message.agents > 0)
    else void answer(socket, message)
  }
  socket.onclose = () => setAgentConnected(false)
}
