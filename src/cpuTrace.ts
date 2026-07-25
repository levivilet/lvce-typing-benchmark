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

export const startCpuTrace = async (cdp: CDPSession): Promise<void> => {
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,v8,disabled-by-default-v8.cpu_profiler',
    options: 'sampling-frequency=1000',
    transferMode: 'ReturnAsStream',
  })
}

export const stopCpuTrace = async (cdp: CDPSession, outputPath: string): Promise<void> => {
  const tracingComplete = new Promise<string>((resolvePromise) => {
    cdp.once('Tracing.tracingComplete', (event: { readonly stream?: string }) => {
      resolvePromise(event.stream || '')
    })
  })
  await cdp.send('Tracing.end')
  const stream = await tracingComplete
  if (!stream) {
    throw new Error('Chromium CPU trace did not return a stream')
  }
  await writeFile(outputPath, await readProtocolStream(cdp, stream))
}
