import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright'
import { renderDocument } from '../fixtures/renderDocument.ts'
import { analyzeRenderResults } from './renderAnalyze.ts'
import { getBrowserProcessMemory } from './browserProcessMemory.ts'
import { startCpuTrace, stopCpuTrace } from './cpuTrace.ts'
import { getEditorFixture } from './editors.ts'
import { startStaticServer } from './staticServer.ts'
import type { EditorFixture, FixtureManifest } from './types.ts'
import type {
  RenderBenchmarkMetadata,
  RenderBenchmarkOptions,
  RenderBenchmarkSummary,
  RenderIterationResult,
} from './renderTypes.ts'

const viewport = { width: 1280, height: 720 }

const getEditorUrl = (fixture: EditorFixture, staticUrl: string): string => {
  const url = new URL(fixture.path, `${staticUrl}/`)
  url.searchParams.set('render', 'true')
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
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    browserCdp = await browser.newBrowserCDPSession()
    pageCdp = await context.newCDPSession(page)
    if (options.profile && !warmup) {
      await startCpuTrace(browserCdp)
      tracing = true
    }
    await page.goto(getEditorUrl(fixture, staticUrl), {
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

const recordEditorLoad = async (
  fixture: EditorFixture,
  staticUrl: string,
  options: RenderBenchmarkOptions,
  videoDirectory: string,
): Promise<void> => {
  let browser: Browser | undefined
  let context: BrowserContext | undefined
  const videoPath = join(videoDirectory, `${fixture.id}.webm`)
  try {
    browser = await chromium.launch({
      headless: !options.headed,
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    })
    context = await browser.newContext({
      recordVideo: {
        dir: videoDirectory,
        size: viewport,
      },
      viewport,
    })
    const page = await context.newPage()
    const video = page.video()
    if (!video) {
      throw new Error(`Playwright did not start video recording for ${fixture.label}`)
    }
    await page.goto(getEditorUrl(fixture, staticUrl), {
      timeout: options.timeout,
      waitUntil: 'domcontentloaded',
    })
    await page.waitForFunction(() => document.documentElement.dataset.renderBenchmarkReady === 'true', undefined, {
      timeout: options.timeout,
    })
    await page.waitForTimeout(500)
    await context.close()
    context = undefined
    const temporaryVideoPath = await video.path()
    await rm(videoPath, { force: true })
    await rename(temporaryVideoPath, videoPath)
    console.info(`${fixture.label} load recording: ${relative(process.cwd(), videoPath) || videoPath}`)
  } finally {
    await context?.close().catch(() => undefined)
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
  const videoDirectory = join(output, 'videos')
  await Promise.all([mkdir(profileDirectory, { recursive: true }), mkdir(videoDirectory, { recursive: true })])
  const manifest = await readManifest(staticDirectory)
  const fixtures = options.editors.map((id) => getEditorFixture(manifest.editors, id))
  const staticServer = await startStaticServer(staticDirectory)
  const results: RenderIterationResult[] = []
  try {
    for (const fixture of fixtures) {
      const totalIterations = options.warmups + options.iterations
      for (let index = 0; index < totalIterations; index++) {
        const warmup = index < options.warmups
        const iteration = warmup ? index + 1 : index - options.warmups + 1
        const result = await runIteration(
          fixture,
          staticServer.url,
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
    for (const fixture of fixtures) {
      await recordEditorLoad(fixture, staticServer.url, options, videoDirectory)
    }
  } finally {
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
