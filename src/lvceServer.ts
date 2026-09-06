import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'

export interface RunningLvceServer {
  readonly url: string
  readonly close: () => Promise<void>
}

const root = resolve(import.meta.dirname, '..')

const getFreePort = async (): Promise<number> => {
  const server = createServer()
  const { promise: listening, resolve: resolveListening, reject: rejectListening } = Promise.withResolvers<void>()
  server.once('error', rejectListening)
  server.listen(0, 'localhost', () => resolveListening())
  await listening
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not allocate a TCP port')
  }
  const { port } = address
  const { promise: closed, resolve: resolveClosed, reject: rejectClosed } = Promise.withResolvers<void>()
  server.close((error) => (error ? rejectClosed(error) : resolveClosed()))
  await closed
  return port
}

const canConnect = async (url: string): Promise<boolean> => {
  const { promise, resolve: resolvePromise } = Promise.withResolvers<boolean>()
  const outgoing = request(url, { method: 'GET', timeout: 1_000 }, (response) => {
    response.resume()
    resolvePromise(Boolean(response.statusCode && response.statusCode < 500))
  })
  outgoing.on('error', () => resolvePromise(false))
  outgoing.on('timeout', () => {
    outgoing.destroy()
    resolvePromise(false)
  })
  outgoing.end()
  return promise
}

const wait = async (milliseconds: number): Promise<void> => {
  const { promise, resolve: resolvePromise } = Promise.withResolvers<void>()
  setTimeout(resolvePromise, milliseconds)
  await promise
}

export const startLvceServer = async (workspace: string, timeout: number): Promise<RunningLvceServer> => {
  const port = await getFreePort()
  const runtimeRoot = join(root, '.tmp', 'lvce-runtime')
  await mkdir(runtimeRoot, { recursive: true })
  const runtimeDirectory = await mkdtemp(join(runtimeRoot, 'run-'))
  const serverPath = join(root, 'node_modules', '@lvce-editor', 'server', 'bin', 'server.js')
  const child = spawn(process.execPath, [serverPath, workspace], {
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      FOLDER: workspace,
      PORT: String(port),
      XDG_CACHE_HOME: join(runtimeDirectory, 'cache'),
      XDG_CONFIG_HOME: join(runtimeDirectory, 'config'),
      XDG_DATA_HOME: join(runtimeDirectory, 'data'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout?.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    output += String(chunk)
  })
  const url = `http://localhost:${port}`
  const startedAt = performance.now()
  while (performance.now() - startedAt < timeout) {
    if (child.exitCode !== null) {
      await rm(runtimeDirectory, { force: true, recursive: true })
      throw new Error(`LVCE server exited during startup\n${output}`)
    }
    if (await canConnect(url)) {
      return {
        url,
        close: async () => {
          if (child.exitCode === null) {
            if (process.platform === 'win32') {
              child.kill('SIGTERM')
            } else if (child.pid) {
              process.kill(-child.pid, 'SIGTERM')
            }
            const { promise: exited, resolve: resolveExited } = Promise.withResolvers<void>()
            child.once('exit', () => resolveExited())
            await Promise.race([exited, wait(2_000)])
            if (child.exitCode === null && child.pid && process.platform !== 'win32') {
              process.kill(-child.pid, 'SIGKILL')
            }
          }
          await rm(runtimeDirectory, { force: true, recursive: true })
        },
      }
    }
    await wait(250)
  }
  child.kill('SIGKILL')
  await rm(runtimeDirectory, { force: true, recursive: true })
  throw new Error(`Timed out starting LVCE server at ${url}\n${output}`)
}
