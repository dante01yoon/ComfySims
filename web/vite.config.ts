import { createReadStream, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url))

function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
}

function serveFixtures(): Plugin {
  return {
    name: 'roomfit-fixtures',
    configureServer(server) {
      server.middlewares.use('/fixtures', (request, response) => {
        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://fixtures').pathname)
        const file = resolve(fixturesDir, `.${pathname}`)
        if (!file.startsWith(fixturesDir + sep) || !isFile(file)) {
          response.statusCode = 404
          response.end()
          return
        }
        createReadStream(file).pipe(response)
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), serveFixtures()],
  server: { host: '127.0.0.1' }
})
