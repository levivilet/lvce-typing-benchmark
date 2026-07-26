import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { chromium, type Browser, type CDPSession, type Page } from 'playwright'
import { renderDocument } from '../fixtures/renderDocument.ts'
import { analyzeRenderResults } from './renderAnalyze.ts'
import { getBrowserProcessMemory } from './browserProcessMemory.ts'
import { startCpuTrace, stopCpuTrace } from './cpuTrace.ts'
import { getEditorFixture } from './editors.ts'
import { startLvceServer, type RunningLvceServer } from './lvceServer.ts'
import { startStaticServer } from './staticServer.ts'
import type { EditorFixture, FixtureManifest } from './types.ts'
import type {
  RenderBenchmarkMetadata,
  RenderBenchmarkOptions,
  RenderBenchmarkSummary,
  RenderIterationResult,
} from './renderTypes.ts'

const installLvceRenderMarker = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    let done = false
    let scheduled = false
    const markWhenPainted = (): void => {
      if (done || scheduled) {
        return
      }
      const rows = document.querySelectorAll('.EditorRow')
      const highlightedToken = document.querySelector('.Token.TagName, .Token.AttributeName, .Token.String, .Token.PunctuationTag')
      if (rows.length < 10 || !highlightedToken) {
        return
      }
      scheduled = true
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scheduled = false
          if (done) {
            return
          }
          const currentRows = document.querySelectorAll('.EditorRow')
          const currentToken = document.querySelector('.Token.TagName, .Token.AttributeName, .Token.String, .Token.PunctuationTag')
          if (currentRows.length < 10 || !currentToken) {
            markWhenPainted()
            return
          }
          done = true
          performance.mark('syntax-highlight-rendered')
          document.documentElement.dataset.renderBenchmarkReady = 'true'
          observer.disconnect()
        })
      })
    }
    const observer = new MutationObserver(markWhenPainted)
    observer.observe(document, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    })
    queueMicrotask(markWhenPainted)
  })
}

const getEditorUrl = (
  fixture: EditorFixture,
  staticUrl: string,
  lvceServer: RunningLvceServer | undefined,
  workspaceFile: string,
): string => {
  if (fixture.kind === 'static') {
    const url = new URL(fixture.path, `${staticUrl}/`)
    url.searchParams.set('render', 'true')
    return url.href
  }
  if (!lvceServer) {
    throw new Error('LVCE server was not started')
  }
  const url = new URL(lvceServer.url)
  url.searchParams.set('benchmarkOpenUri', workspaceFile)
  return url.href
}

const getNavigationTiming = async (page: Page): Promise<number | null> => {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return navigation ? navigation.domContentLoadedEventEnd : null
  })
}

const getRenderDuration = async (page: Page): Promise<number> => {
  return page.evaluate(() => {
    const mark = performance.getEntriesByName('syntax-highlight-rendered', 'mark').at(-1)
    if (!mark) {
      throw new Error('Syntax highlight render mark was not recorded')
    }
    return mark.startTime
  })
}

const measureMemory = async (
  browserCdp: CDPSession,
  pageCdp: CDPSession,
): Promise<{
  readonly gpuProcessMemoryBytes: number | null
  readonly javascriptHeapUsedBytes: number | null
  readonly rendererProcessMemoryBytes: number | null
}> => {
  const [processInfoResult, heapUsage] = await Promise.all([
    browserCdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] })),
    pageCdp.send('Runtime.getHeapUsage').catch(() => null),
  ])
  const memory = await getBrowserProcessMemory(processInfoResult.processInfo)
  return {
    gpuProcessMemoryBytes: memory.gpuBytes,
    javascriptHeapUsedBytes: heapUsage?.usedSize ?? null,
    rendererProcessMemoryBytes: memory.rendererBytes,
  }
}

const runIteration = async (
  fixture: EditorFixture,
  staticUrl: string,
  lvceServer: RunningLvceServer | undefined,
  workspaceFile: string,
  iteration: number,
  warmup: boolean,
  options: RenderBenchmarkOptions,
  profileDirectory: string,
): Promise<RenderIterationResult> => {
  let browser: Browser | undefined
  let browserCdp: CDPSession | undefined
  let pageCdp: CDPSession | undefined
  let tracing = false
  const profileFileName = `${fixture.id}-${iteration}.json`
  const profilePath = join(profileDirectory, profileFileName)
  try {
    browser = await chromium.launch({
      headless: !options.headed,
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    })
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page = await context.newPage()
    if (fixture.kind === 'lvce') {
      await installLvceRenderMarker(page)
    }
    browserCdp = await browser.newBrowserCDPSession()
    pageCdp = await context.newCDPSession(page)
    if (options.profile && !warmup) {
      await startCpuTrace(browserCdp)
      tracing = true
    }
    await page.goto(getEditorUrl(fixture, staticUrl, lvceServer, workspaceFile), {
      timeout: options.timeout,
      waitUntil: 'domcontentloaded',
    })
    await page.waitForFunction(() => document.documentElement.dataset.renderBenchmarkReady === 'true', undefined, {
      timeout: options.timeout,
    })
    const [domContentLoadedMs, renderDurationMs] = await Promise.all([getNavigationTiming(page), getRenderDuration(page)])
    if (tracing) {
      await stopCpuTrace(browserCdp, profilePath)
      tracing = false
    }
    const memory = await measureMemory(browserCdp, pageCdp)
    return {
      domContentLoadedMs,
      editor: fixture.id,
      gpuProcessMemoryBytes: memory.gpuProcessMemoryBytes,
      iteration,
      javascriptHeapUsedBytes: memory.javascriptHeapUsedBytes,
      ...(options.profile && !warmup ? { profilePath: `profiles/${profileFileName}` } : {}),
      rendererProcessMemoryBytes: memory.rendererProcessMemoryBytes,
      renderDurationMs,
      success: true,
      warmup,
    }
  } catch (error) {
    if (browserCdp && tracing) {
      await stopCpuTrace(browserCdp, profilePath).catch(() => undefined)
    }
    return {
      domContentLoadedMs: null,
      editor: fixture.id,
      error: error instanceof Error ? error.stack || error.message : String(error),
      gpuProcessMemoryBytes: null,
      iteration,
      javascriptHeapUsedBytes: null,
      rendererProcessMemoryBytes: null,
      renderDurationMs: 0,
      success: false,
      warmup,
    }
  } finally {
    await pageCdp?.detach().catch(() => undefined)
    await browserCdp?.detach().catch(() => undefined)
    await browser?.close().catch(() => undefined)
  }
}

const readManifest = async (staticDirectory: string): Promise<FixtureManifest> => {
  return JSON.parse(await readFile(join(staticDirectory, 'manifest.json'), 'utf8')) as FixtureManifest
}

export const runRenderBenchmark = async (options: RenderBenchmarkOptions): Promise<RenderBenchmarkSummary> => {
  const output = resolve(options.output)
  const staticDirectory = resolve(options.staticDirectory)
  const profileDirectory = join(output, 'profiles')
  const workspace = resolve('.tmp/workspace')
  const workspaceFile = join(workspace, 'benchmark.html')
  await mkdir(profileDirectory, { recursive: true })
  const manifest = await readManifest(staticDirectory)
  const fixtures = options.editors.map((id) => getEditorFixture(manifest.editors, id))
  const staticServer = await startStaticServer(staticDirectory)
  let lvceServer: RunningLvceServer | undefined
  const results: RenderIterationResult[] = []
  try {
    lvceServer = options.editors.includes('lvce-editor') ? await startLvceServer(workspace, options.timeout) : undefined
    for (const fixture of fixtures) {
      const totalIterations = options.warmups + options.iterations
      for (let index = 0; index < totalIterations; index++) {
        const warmup = index < options.warmups
        const iteration = warmup ? index + 1 : index - options.warmups + 1
        const result = await runIteration(
          fixture,
          staticServer.url,
          lvceServer,
          workspaceFile,
          iteration,
          warmup,
          options,
          profileDirectory,
        )
        results.push(result)
        const status = result.success ? `${result.renderDurationMs.toFixed(2)} ms` : 'failed'
        console.info(`${fixture.label} render ${warmup ? 'warmup' : 'iteration'} ${iteration}: ${status}`)
      }
    }
  } finally {
    await lvceServer?.close().catch(() => undefined)
    await staticServer.close().catch(() => undefined)
  }
  const metadata: RenderBenchmarkMetadata = {
    document: 'benchmark.html',
    editors: fixtures,
    lines: renderDocument.trimEnd().split('\n').length,
  }
  await writeFile(join(output, 'benchmark.json'), `${JSON.stringify(metadata, undefined, 2)}\n`)
  await writeFile(join(output, 'iterations.json'), `${JSON.stringify(results, undefined, 2)}\n`)
  const summary = await analyzeRenderResults(output)
  const failures = results.filter((result) => !result.warmup && !result.success)
  if (failures.length > 0) {
    const details = failures.map((failure) => `${failure.editor} #${failure.iteration}: ${failure.error || 'unknown error'}`).join('\n')
    throw new Error(`${failures.length} measured render benchmark iteration(s) failed:\n${details}`)
  }
  console.info(`Wrote render benchmark results to ${relative(process.cwd(), output) || output}`)
  return summary
}
