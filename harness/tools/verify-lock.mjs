import { createServer } from 'node:net'

const VERIFY_LOCK_PORT = 8194

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', (error) => (error.code === 'EADDRINUSE' ? resolve(null) : reject(error)))
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => resolve(server.unref()))
  })
}

/** Waits until this process is the only verify, holding a loopback port the OS frees when the process dies. */
export async function holdVerifyLock({ port = VERIFY_LOCK_PORT, retryMs = 1000, onWait = () => {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    const server = await listenOn(port)
    if (server) return server
    if (attempt === 0) onWait(port)
    await new Promise((resolve) => setTimeout(resolve, retryMs))
  }
}
