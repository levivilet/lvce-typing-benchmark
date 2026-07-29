import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright'
import { startCpuTrace, stopCpuTrace } from './cpuTrace.ts'
import { getIdeFixture } from './ides.ts'
import { startLvceServer, type RunningLvceServer } from './lvceServer.ts'
import { analyzeStartupResults } from './startupAnalyze.ts'
import type {
  StartupBenchmarkOptions,
  StartupBenchmarkSummary,
  StartupIterationResult,
} from './startupTypes.ts'
import { startStaticServer } from './staticServer.ts'
import type { FixtureManifest, IdeFixture, IdeId } from './types.ts'

const viewport = { width: 1280, height: 720 }

const readinessSelectors: Readonly<Record<IdeId, readonly string[]>> = {
  'lvce-editor': ['.Workbench', '.ActivityBar'],
  vscode: ['.monaco-workbench', '.part.activitybar', '.part.editor'],
}

const installStartupMarker = async (page: Page, ide: IdeId): Promise<void> => {
  await page.addInitScript((selectors: readonly string[]) => {
    let done = false
    let scheduled = false
    const isReady = (): boolean => selectors.every((selector) => document.querySelector(selector))
    const markWhenPainted = (): void => {
      if (done || scheduled || !isReady()) {
        return
      }
      scheduled = true
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scheduled = false
          if (done || !isReady()) {
            return
          }
          done = true
          performance.mark('ide-startup-ready')
          document.documentElement.dataset.startupBenchmarkReady = 'true'
          observer.disconnect()
        })
      })
    }
    const observer = new MutationObserver(markWhenPainted)
    observer.observe(document, { attributes: true, childList: true, subtree: true })
    queueMicrotask(markWhenPainted)
  }, readinessSelectors[ide])
}

const getIdeUrl = (
  fixture: IdeFixture,
  staticUrl: string,
  lvceServer: RunningLvceServer | undefined,
): string => {
  if (fixture.kind === 'static') {
    return new URL(fixture.path, `${staticUrl}/`).href
  }
  if (!lvceServer) {
    throw new Error('LVCE server was not started')
  }
  return lvceServer.url
}

const getNavigationTiming = async (page: Page): Promise<number | null> => {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return navigation ? navigation.domContentLoadedEventEnd : null
  })
}

const getStartupDuration = async (page: Page): Promise<number> => {
  return page.evaluate(() => {
    const mark = performance.getEntriesByName('ide-startup-ready', 'mark').at(-1)
    if (!mark) {
      throw new Error('IDE startup mark was not recorded')
    }
    return mark.startTime
  })
}

const runIteration = async (
  fixture: IdeFixture,
  url: string,
  iteration: number,
  warmup: boolean,
  options: StartupBenchmarkOptions,
  profileDirectory: string,
): Promise<StartupIterationResult> => {
  let browser: Browser | undefined
  let browserCdp: CDPSession | undefined
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
    await installStartupMarker(page, fixture.id)
    browserCdp = options.profile && !warmup ? await browser.newBrowserCDPSession() : undefined
    if (browserCdp) {
      await startCpuTrace(browserCdp)
      tracing = true
    }
    await page.goto(url, { timeout: options.timeout, waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.documentElement.dataset.startupBenchmarkReady === 'true', undefined, {
      timeout: options.timeout,
    })
    const [domContentLoadedMs, startupDurationMs] = await Promise.all([
      getNavigationTiming(page),
      getStartupDuration(page),
    ])
    if (browserCdp) {
      await stopCpuTrace(browserCdp, profilePath)
      tracing = false
    }
    return {
      domContentLoadedMs,
      ide: fixture.id,
      iteration,
      ...(browserCdp ? { profilePath: `profiles/${profileFileName}` } : {}),
      startupDurationMs,
      success: true,
      warmup,
    }
  } catch (error) {
    if (browserCdp && tracing) {
      await stopCpuTrace(browserCdp, profilePath).catch(() => undefined)
    }
    return {
      domContentLoadedMs: null,
      error: error instanceof Error ? error.stack || error.message : String(error),
      ide: fixture.id,
      iteration,
      startupDurationMs: 0,
      success: false,
      warmup,
    }
  } finally {
    await browserCdp?.detach().catch(() => undefined)
    await browser?.close().catch(() => undefined)
  }
}

const recordIdeLoad = async (
  fixture: IdeFixture,
  url: string,
  options: StartupBenchmarkOptions,
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
    await installStartupMarker(page, fixture.id)
    const video = page.video()
    if (!video) {
      throw new Error(`Playwright did not start video recording for ${fixture.label}`)
    }
    await page.goto(url, { timeout: options.timeout, waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.documentElement.dataset.startupBenchmarkReady === 'true', undefined, {
      timeout: options.timeout,
    })
    await page.waitForTimeout(500)
    await context.close()
    context = undefined
    const temporaryVideoPath = await video.path()
    await rm(videoPath, { force: true })
    await rename(temporaryVideoPath, videoPath)
    console.info(`${fixture.label} startup recording: ${relative(process.cwd(), videoPath) || videoPath}`)
  } finally {
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
  }
}

const readManifest = async (staticDirectory: string): Promise<FixtureManifest> => {
  return JSON.parse(await readFile(join(staticDirectory, 'manifest.json'), 'utf8')) as FixtureManifest
}

export const runStartupBenchmark = async (options: StartupBenchmarkOptions): Promise<StartupBenchmarkSummary> => {
  const output = resolve(options.output)
  const staticDirectory = resolve(options.staticDirectory)
  const profileDirectory = join(output, 'profiles')
  const videoDirectory = join(output, 'videos')
  const workspace = resolve('.tmp/workspace')
  await Promise.all([mkdir(profileDirectory, { recursive: true }), mkdir(videoDirectory, { recursive: true })])
  const manifest = await readManifest(staticDirectory)
  const fixtures = options.ides.map((id) => getIdeFixture(manifest.ides, id))
  const staticServer = await startStaticServer(staticDirectory)
  let lvceServer: RunningLvceServer | undefined
  const results: StartupIterationResult[] = []
  try {
    lvceServer = options.ides.includes('lvce-editor') ? await startLvceServer(workspace, options.timeout) : undefined
    for (const fixture of fixtures) {
      const url = getIdeUrl(fixture, staticServer.url, lvceServer)
      const totalIterations = options.warmups + options.iterations
      for (let index = 0; index < totalIterations; index++) {
        const warmup = index < options.warmups
        const iteration = warmup ? index + 1 : index - options.warmups + 1
        const result = await runIteration(fixture, url, iteration, warmup, options, profileDirectory)
        results.push(result)
        const status = result.success ? `${result.startupDurationMs.toFixed(2)} ms` : 'failed'
        console.info(`${fixture.label} startup ${warmup ? 'warmup' : 'iteration'} ${iteration}: ${status}`)
      }
    }
    for (const fixture of fixtures) {
      await recordIdeLoad(fixture, getIdeUrl(fixture, staticServer.url, lvceServer), options, videoDirectory)
    }
  } finally {
    await lvceServer?.close().catch(() => undefined)
    await staticServer.close().catch(() => undefined)
  }
  await writeFile(join(output, 'benchmark.json'), `${JSON.stringify({ ides: fixtures }, undefined, 2)}\n`)
  await writeFile(join(output, 'iterations.json'), `${JSON.stringify(results, undefined, 2)}\n`)
  const summary = await analyzeStartupResults(output)
  const failures = results.filter((result) => !result.warmup && !result.success)
  if (failures.length > 0) {
    const details = failures.map((failure) => `${failure.ide} #${failure.iteration}: ${failure.error || 'unknown error'}`).join('\n')
    throw new Error(`${failures.length} measured startup benchmark iteration(s) failed:\n${details}`)
  }
  console.info(`Wrote startup benchmark results to ${relative(process.cwd(), output) || output}`)
  return summary
}
