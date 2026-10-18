import { readFile } from 'node:fs/promises'
import WebSocket from 'ws'

import type { RoomfitEditorApi } from '../spec/contracts/editor-api.ts'

/** The editor surface reachable over the bridge: `window.roomfit` plus reading a blob URL of the tab as base64. */
export type BridgedApi = RoomfitEditorApi & { base64At(url: string): Promise<string> }

type Method = keyof BridgedApi
type Result<M extends Method> = Awaited<ReturnType<BridgedApi[M]>>
type Reply = { id: number; result?: unknown; error?: { message: string } }
type Waiter = { resolve: (value: unknown) => void; reject: (error: Error) => void }

const STATE_TIMEOUT_MS = 10_000
const JOB_TIMEOUT_MS = 15 * 60_000
const JOB_METHODS = new Set<Method>(['addProductFromPhoto', 'renderInComfy', 'photo3d', 'retryJob', 'view360'])

/** Calls the open editor tab through the dev server's bridge, connecting on first use and again after a disconnect. */
export function editorBridge({ url, tokenFile }: { url: string; tokenFile: string }) {
  const noEditor = `No roomfit editor is connected. Open ${url} and try again.`
  const waiting = new Map<number, Waiter>()
  let connection: Promise<WebSocket> | null = null
  let lastId = 0

  const settle = (reply: Reply) => {
    const waiter = waiting.get(reply.id)
    if (!waiter) return
    waiting.delete(reply.id)
    if (reply.error) waiter.reject(new Error(reply.error.message))
    else waiter.resolve(reply.result)
  }

  const disconnected = () => {
    connection = null
    for (const waiter of waiting.values()) waiter.reject(new Error(noEditor))
    waiting.clear()
  }

  const open = async (): Promise<WebSocket> => {
    const token = (await readFile(tokenFile, 'utf8').catch(() => '')).trim()
    if (!token) throw new Error(noEditor)
    const socket = new WebSocket(`${url.replace(/^http/, 'ws')}/__roomfit-bridge?role=agent&token=${token}`)
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve)
      socket.once('error', () => reject(new Error(noEditor)))
    })
    socket.on('error', () => {})
    socket.on('message', (data) => settle(JSON.parse(data.toString())))
    socket.on('close', disconnected)
    return socket
  }

  const connect = (): Promise<WebSocket> => {
    connection ??= open().catch((error: unknown) => {
      connection = null
      throw error
    })
    return connection
  }

  return async function call<M extends Method>(method: M, params: Parameters<BridgedApi[M]>, label: string): Promise<Result<M>> {
    const socket = await connect()
    const id = ++lastId
    const timeoutMs = JOB_METHODS.has(method) ? JOB_TIMEOUT_MS : STATE_TIMEOUT_MS
    return new Promise<Result<M>>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id)
        reject(new Error(`The roomfit editor did not answer ${method} within ${timeoutMs / 1000} s.`))
      }, timeoutMs)
      waiting.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value as Result<M>)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        }
      })
      socket.send(JSON.stringify({ id, method, params, label }))
    })
  }
}

export type EditorCall = ReturnType<typeof editorBridge>
