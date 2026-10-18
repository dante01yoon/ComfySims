import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, normalize } from 'node:path'

const root = new URL('./out/', import.meta.url).pathname
createServer((request, response) => {
  const file = normalize(join(root, decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname)))
  response.setHeader('Access-Control-Allow-Origin', '*')
  if (!file.startsWith(root) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
    response.statusCode = 404
    response.end()
    return
  }
  createReadStream(file).pipe(response)
}).listen(5180, '127.0.0.1', () => console.log('demo assets on http://127.0.0.1:5180'))
