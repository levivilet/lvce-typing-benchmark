import { writeFile } from 'node:fs/promises'
import type { CDPSession } from 'playwright'

const readProtocolStream = async (cdp: CDPSession, stream: string): Promise<string> => {
  let result = ''
  let done = false
  while (!done) {
    const chunk = (await cdp.send('IO.read', { handle: stream })) as { readonly data?: string; readonly eof?: boolean }
    result += chunk.data || ''
    done = Boolean(chunk.eof)
  }
  await cdp.send('IO.close', { handle: stream }).catch(() => undefined)
  return result
}

export const startTrace = async (cdp: CDPSession, cpuProfile: boolean): Promise<void> => {
  await cdp.send('Tracing.start', {
    categories: cpuProfile ? 'devtools.timeline,v8,disabled-by-default-v8.cpu_profiler' : 'devtools.timeline',
    ...(cpuProfile ? { options: 'sampling-frequency=1000' } : {}),
    transferMode: 'ReturnAsStream',
  })
}

export const startCpuTrace = async (cdp: CDPSession): Promise<void> => {
  await startTrace(cdp, true)
}

export const stopTrace = async (cdp: CDPSession): Promise<string> => {
  const { promise: tracingComplete, resolve: resolvePromise } = Promise.withResolvers<string>()
  cdp.once('Tracing.tracingComplete', (event: { readonly stream?: string }) => {
    resolvePromise(event.stream || '')
  })
  await cdp.send('Tracing.end')
  const stream = await tracingComplete
  if (!stream) {
    throw new Error('Chromium CPU trace did not return a stream')
  }
  return readProtocolStream(cdp, stream)
}

export const stopCpuTrace = async (cdp: CDPSession, outputPath: string): Promise<void> => {
  await writeFile(outputPath, await stopTrace(cdp))
}
