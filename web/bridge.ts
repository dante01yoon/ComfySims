import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname } from 'node:path'
import type { Plugin } from 'vite'
import { WebSocketServer } from 'ws'
import type { RawData, WebSocket } from 'ws'

const BRIDGE_PATH = '/__roomfit-bridge'

const UNAUTHORIZED = 4401
const FORBIDDEN = 4403
const BAD_ROLE = 4400
const REPLACED = 4409
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

type Message = { id: unknown; [key: string]: unknown }
type Route = { agent: WebSocket; editor: WebSocket; id: unknown }

function messageOf(data: RawData): Message | null {
  try {
    const value: unknown = JSON.parse(data.toString())
    return typeof value === 'object' && value !== null && 'id' in value ? (value as Message) : null
  } catch {
    return null
  }
}

function isLoopbackHost(request: IncomingMessage): boolean {
  const host = request.headers.host
  return host !== undefined && URL.canParse(`http://${host}`) && LOOPBACK_HOSTS.has(new URL(`http://${host}`).hostname)
}

function isSameOrigin(request: IncomingMessage): boolean {
  const { origin } = request.headers
  return origin === undefined || origin === `http://${request.headers.host}`
}

/** A request from this machine to a loopback host whose Origin, if any, is the dev server itself. */
export function isLocal(request: IncomingMessage): boolean {
  return LOOPBACK_ADDRESSES.has(request.socket.remoteAddress ?? '') && isLoopbackHost(request) && isSameOrigin(request)
}

function matches(given: string | null, token: string): boolean {
  const expected = Buffer.from(token)
  const actual = Buffer.from(given ?? '')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function refusal(request: IncomingMessage, url: URL, token: string): number | null {
  if (!matches(url.searchParams.get('token'), token)) return UNAUTHORIZED
  if (!isLocal(request)) return FORBIDDEN
  const role = url.searchParams.get('role')
  return role === 'editor' || role === 'agent' ? null : BAD_ROLE
}

function noEditor(request: IncomingMessage): string {
  return `No roomfit editor is connected. Open http://${request.headers.host} and try again.`
}

/** Relays MCP calls from agents to the newest editor tab, guarded by a token in `tokenFile` and loopback-only. */
export function bridge({ tokenFile }: { tokenFile: string }): Plugin {
  return {
    name: 'roomfit-bridge',
    configureServer(server) {
      const token = randomBytes(16).toString('hex')
      mkdirSync(dirname(tokenFile), { recursive: true })
      writeFileSync(tokenFile, token)

      const sockets = new WebSocketServer({ noServer: true })
      const agents = new Set<WebSocket>()
      const routes = new Map<number, Route>()
      let editor: WebSocket | null = null
      let lastId = 0

      const tellEditor = () => editor?.send(JSON.stringify({ id: null, agents: agents.size }))

      const attachEditor = (socket: WebSocket) => {
        editor?.close(REPLACED, 'a newer editor tab connected')
        editor = socket
        tellEditor()
        socket.on('message', (data) => {
          const reply = messageOf(data)
          const route = typeof reply?.id === 'number' ? routes.get(reply.id) : undefined
          if (!reply || !route) return
          routes.delete(reply.id as number)
          route.agent.send(JSON.stringify({ ...reply, id: route.id }))
        })
        socket.on('close', () => {
          if (editor === socket) editor = null
          for (const [id, route] of routes) {
            if (route.editor !== socket) continue
            routes.delete(id)
            route.agent.send(JSON.stringify({ id: route.id, error: { message: 'No roomfit editor is connected: the editor tab closed.' } }))
          }
        })
      }

      const attachAgent = (socket: WebSocket, request: IncomingMessage) => {
        agents.add(socket)
        tellEditor()
        socket.on('message', (data) => {
          const call = messageOf(data)
          if (!call) return
          if (!editor) return socket.send(JSON.stringify({ id: call.id, error: { message: noEditor(request) } }))
          routes.set(++lastId, { agent: socket, editor, id: call.id })
          editor.send(JSON.stringify({ ...call, id: lastId }))
        })
        socket.on('close', () => {
          agents.delete(socket)
          tellEditor()
        })
      }

      server.middlewares.use(`${BRIDGE_PATH}/token`, (request, response) => {
        response.statusCode = isLoopbackHost(request) && isSameOrigin(request) ? 200 : 403
        response.setHeader('Cache-Control', 'no-store')
        response.end(response.statusCode === 200 ? token : '')
      })

      server.httpServer?.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url ?? '/', 'http://bridge')
        if (url.pathname !== BRIDGE_PATH) return
        sockets.handleUpgrade(request, socket, head, (connection) => {
          const code = refusal(request, url, token)
          if (code !== null) return connection.close(code)
          if (url.searchParams.get('role') === 'editor') attachEditor(connection)
          else attachAgent(connection, request)
        })
      })
    }
  }
}
