import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { chromium, type Browser, type CDPSession, type Page } from 'playwright'
import { analyzeResults } from './analyze.ts'
import { startCpuTrace, stopCpuTrace } from './cpuTrace.ts'
import { armTypingLagSample, getTypingLagSamples, type TypingLagResult } from './typingLag.ts'
import { getEditorFixture } from './editors.ts'
import { startStaticServer } from './staticServer.ts'
import type { BenchmarkMetadata, BenchmarkOptions, BenchmarkSummary, EditorFixture, FixtureManifest, IterationResult, TraceProfile } from './types.ts'

const getTextLength = async (page: Page): Promise<number> => {
  return page.evaluate(() => {
    const benchmark = (globalThis as unknown as Window).__typingBenchmark
    if (benchmark) {
      return benchmark.getText().length
    }
    const lines = [...document.querySelectorAll('.EditorRow')]
    return lines.map((line) => line.textContent || '').join('\n').length
  })
}

const waitForTextLength = async (page: Page, expected: number, timeout: number): Promise<void> => {
  await page.waitForFunction(
    (length) => {
      const benchmark = (globalThis as unknown as Window).__typingBenchmark
      if (benchmark) {
        return benchmark.getText().length === length
      }
      const lines = [...document.querySelectorAll('.EditorRow')]
      return lines.map((line) => line.textContent || '').join('\n').length === length
    },
    expected,
    { timeout },
  )
}

const waitForPaint = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const { promise, resolve: resolvePromise } = Promise.withResolvers<void>()
    requestAnimationFrame(() => requestAnimationFrame(() => resolvePromise()))
    await promise
  })
}

const prepareStaticEditor = async (page: Page, url: string, timeout: number): Promise<void> => {
  await page.goto(url, { timeout, waitUntil: 'load' })
  await page.waitForFunction(() => document.documentElement.dataset.benchmarkReady === 'true', undefined, { timeout })
  await page.evaluate(() => (globalThis as unknown as Window).__typingBenchmark?.focus())
}

const prepareEditor = async (
  page: Page,
  fixture: EditorFixture,
  staticUrl: string,
  timeout: number,
): Promise<void> => {
  await prepareStaticEditor(page, new URL(fixture.path, `${staticUrl}/`).href, timeout)
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await waitForTextLength(page, 0, timeout)
  await waitForPaint(page)
}

const runIteration = async (
  browser: Browser,
  fixture: EditorFixture,
  staticUrl: string,
  iteration: number,
  warmup: boolean,
  options: BenchmarkOptions,
  profileDirectory: string,
): Promise<IterationResult> => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  let browserCdp: CDPSession | undefined
  const profileFileName = `${fixture.id}-${iteration}.json`
  const profilePath = join(profileDirectory, profileFileName)
  let tracing = false
  try {
    const page = await context.newPage()
    browserCdp = options.profile && !warmup ? await browser.newBrowserCDPSession() : undefined
    await prepareEditor(page, fixture, staticUrl, options.timeout)
    if (browserCdp) {
      await startCpuTrace(browserCdp)
      tracing = true
    }
    const startedAt = performance.now()
    await page.keyboard.type('a'.repeat(options.characters))
    await waitForTextLength(page, options.characters, options.timeout)
    await waitForPaint(page)
    const typingDurationMs = performance.now() - startedAt
    if (browserCdp) {
      await stopCpuTrace(browserCdp, profilePath)
      tracing = false
    }
    return {
      editor: fixture.id,
      iteration,
      ...(browserCdp ? { profilePath: `profiles/${profileFileName}` } : {}),
      success: true,
      typingDurationMs,
      warmup,
    }
  } catch (error) {
    if (browserCdp && tracing) {
      await stopCpuTrace(browserCdp, profilePath).catch(() => undefined)
    }
    return {
      editor: fixture.id,
      iteration,
      success: false,
      typingDurationMs: 0,
      warmup,
      error: error instanceof Error ? error.stack || error.message : String(error),
    }
  } finally {
    await browserCdp?.detach().catch(() => undefined)
    await context.close().catch(() => undefined)
  }
}

const runTypingLag = async (
  browser: Browser,
  fixture: EditorFixture,
  staticUrl: string,
  options: BenchmarkOptions,
  output: string,
): Promise<TypingLagResult> => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const tracePath = `profiles/${fixture.id}-typing-lag.json`
  let cdp: CDPSession | undefined
  let tracing = false
  try {
    const page = await context.newPage()
    await prepareEditor(page, fixture, staticUrl, options.timeout)
    cdp = await context.newCDPSession(page)
    const { frameTree } = await cdp.send('Page.getFrameTree')
    await cdp.send('Tracing.start', {
      categories: 'devtools.timeline,blink,blink.user_timing',
      transferMode: 'ReturnAsStream',
    })
    tracing = true
    for (let sample = 1; sample <= options.lagSamples; sample++) {
      await armTypingLagSample(page, fixture.id, sample, options.timeout)
      await page.keyboard.press('a')
      await page.waitForFunction(() => Boolean(document.documentElement.dataset.typingLagSettled), undefined, { timeout: options.timeout })
      const settled = await page.evaluate(() => document.documentElement.dataset.typingLagSettled)
      if (settled !== String(sample)) {
        throw new Error(`Timed out waiting for character ${sample} to render`)
      }
    }
    await stopCpuTrace(cdp, join(output, tracePath))
    tracing = false
    const trace = JSON.parse(await readFile(join(output, tracePath), 'utf8')) as TraceProfile
    const samplesMs = getTypingLagSamples(trace, options.lagSamples, frameTree.frame.id)
    return { editor: fixture.id, requestedSamples: options.lagSamples, samplesMs, success: true, tracePath }
  } catch (error) {
    if (cdp && tracing) {
      await stopCpuTrace(cdp, join(output, tracePath)).catch(() => undefined)
    }
    return {
      editor: fixture.id,
      requestedSamples: options.lagSamples,
      samplesMs: [],
      success: false,
      tracePath,
      error: error instanceof Error ? error.stack || error.message : String(error),
    }
  } finally {
    await cdp?.detach().catch(() => undefined)
    await context.close().catch(() => undefined)
  }
}

const readManifest = async (staticDirectory: string): Promise<FixtureManifest> => {
  return JSON.parse(await readFile(join(staticDirectory, 'manifest.json'), 'utf8')) as FixtureManifest
}

export const runBenchmark = async (options: BenchmarkOptions): Promise<BenchmarkSummary> => {
  const output = resolve(options.output)
  const staticDirectory = resolve(options.staticDirectory)
  const profileDirectory = join(output, 'profiles')
  await mkdir(profileDirectory, { recursive: true })
  const manifest = await readManifest(staticDirectory)
  const fixtures = options.editors.map((id) => getEditorFixture(manifest.editors, id))
  const staticServer = await startStaticServer(staticDirectory)
  let browser: Browser | undefined
  const results: IterationResult[] = []
  const lagResults: TypingLagResult[] = []
  try {
    browser = await chromium.launch({
      headless: !options.headed,
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    })
    for (const fixture of fixtures) {
      const totalIterations = options.warmups + options.iterations
      for (let index = 0; index < totalIterations; index++) {
        const warmup = index < options.warmups
        const iteration = warmup ? index + 1 : index - options.warmups + 1
        const result = await runIteration(
          browser,
          fixture,
          staticServer.url,
          iteration,
          warmup,
          options,
          profileDirectory,
        )
        results.push(result)
        const status = result.success ? `${result.typingDurationMs.toFixed(2)} ms` : 'failed'
        console.info(`${fixture.label} ${warmup ? 'warmup' : 'iteration'} ${iteration}: ${status}`)
      }
      const lagResult = await runTypingLag(browser, fixture, staticServer.url, options, output)
      lagResults.push(lagResult)
      console.info(`${fixture.label} typing lag: ${lagResult.success ? `${lagResult.samplesMs.length} samples` : lagResult.error}`)
    }
  } finally {
    await browser?.close().catch(() => undefined)
    await staticServer.close().catch(() => undefined)
  }
  const metadata: BenchmarkMetadata = {
    characters: options.characters,
    editors: fixtures,
  }
  await writeFile(join(output, 'benchmark.json'), `${JSON.stringify(metadata, undefined, 2)}\n`)
  await writeFile(join(output, 'iterations.json'), `${JSON.stringify(results, undefined, 2)}\n`)
  await writeFile(join(output, 'typing-lag.json'), `${JSON.stringify(lagResults, undefined, 2)}\n`)
  const summary = await analyzeResults(output, fixtures, options.characters)
  const failures = results.filter((result) => !result.warmup && !result.success)
  const lagFailures = lagResults.filter((result) => !result.success)
  if (lagFailures.length > 0) {
    throw new Error(`Typing-lag measurement failed:\n${lagFailures.map((result) => `${result.editor}: ${result.error}`).join('\n')}`)
  }
  if (failures.length > 0) {
    const details = failures.map((failure) => `${failure.editor} #${failure.iteration}: ${failure.error || 'unknown error'}`).join('\n')
    throw new Error(`${failures.length} measured benchmark iteration(s) failed:\n${details}`)
  }
  console.info(`Wrote benchmark results to ${relative(process.cwd(), output) || output}`)
  return summary
}
