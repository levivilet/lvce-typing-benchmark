import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, relative, resolve } from 'node:path'

export interface RunningStaticServer {
  readonly url: string
  readonly close: () => Promise<void>
}

const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const closeServer = async (server: Server): Promise<void> => {
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()))
  })
}

export const startStaticServer = async (directory: string): Promise<RunningStaticServer> => {
  const root = resolve(directory)
  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const url = new URL(request.url || '/', 'http://localhost')
      let pathname = decodeURIComponent(url.pathname)
      if (pathname.endsWith('/')) {
        pathname += 'index.html'
      }
      const filePath = resolve(join(root, pathname.slice(1)))
      const relativePath = relative(root, filePath)
      if (relativePath.startsWith('..') || relativePath.includes('/../')) {
        response.writeHead(403).end('Forbidden')
        return
      }
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) {
        response.writeHead(404).end('Not found')
        return
      }
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': contentTypes[extname(filePath)] || 'application/octet-stream',
      })
      createReadStream(filePath).pipe(response)
    } catch (error) {
      const status = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500
      response.writeHead(status).end(status === 404 ? 'Not found' : 'Internal server error')
    }
  }
  const server = createServer((request, response) => {
    void handleRequest(request, response)
  })
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, 'localhost', () => {
      server.off('error', reject)
      resolvePromise()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    await closeServer(server)
    throw new Error('Static server did not bind to a TCP port')
  }
  return {
    url: `http://localhost:${address.port}`,
    close: () => closeServer(server),
  }
}
