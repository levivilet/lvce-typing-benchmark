import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import { chromium, type Browser, type CDPSession, type Page } from 'playwright'
import { analyzeResults } from './analyze.ts'
import { startCpuTrace, stopCpuTrace } from './cpuTrace.ts'
import { getEditorFixture } from './editors.ts'
import { startLvceServer, type RunningLvceServer } from './lvceServer.ts'
import { startStaticServer } from './staticServer.ts'
import type { BenchmarkMetadata, BenchmarkOptions, BenchmarkSummary, EditorFixture, FixtureManifest, IterationResult } from './types.ts'

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
    await new Promise<void>((resolvePromise) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolvePromise()))
    })
  })
}

const prepareStaticEditor = async (page: Page, url: string, timeout: number): Promise<void> => {
  await page.goto(url, { timeout, waitUntil: 'load' })
  await page.waitForFunction(() => document.documentElement.dataset.benchmarkReady === 'true', undefined, { timeout })
  await page.evaluate(() => (globalThis as unknown as Window).__typingBenchmark?.focus())
}

const prepareLvceEditor = async (page: Page, url: string, workspaceFile: string, timeout: number): Promise<void> => {
  await page.goto(url, { timeout, waitUntil: 'load' })
  const fileName = basename(workspaceFile)
  const file = page.getByText(fileName, { exact: true }).first()
  await file.waitFor({ state: 'visible', timeout })
  await file.dblclick()
  const editorInput = page.locator('.EditorInput textarea')
  await editorInput.waitFor({ state: 'attached', timeout })
  await editorInput.focus()
}

const prepareEditor = async (
  page: Page,
  fixture: EditorFixture,
  staticUrl: string,
  lvceServer: RunningLvceServer | undefined,
  workspaceFile: string,
  timeout: number,
): Promise<void> => {
  if (fixture.kind === 'lvce') {
    if (!lvceServer) {
      throw new Error('LVCE server was not started')
    }
    await prepareLvceEditor(page, lvceServer.url, workspaceFile, timeout)
  } else {
    await prepareStaticEditor(page, new URL(fixture.path, `${staticUrl}/`).href, timeout)
  }
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await waitForTextLength(page, 0, timeout)
  await waitForPaint(page)
}

const runIteration = async (
  browser: Browser,
  fixture: EditorFixture,
  staticUrl: string,
  lvceServer: RunningLvceServer | undefined,
  workspaceFile: string,
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
    await prepareEditor(page, fixture, staticUrl, lvceServer, workspaceFile, options.timeout)
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

const readManifest = async (staticDirectory: string): Promise<FixtureManifest> => {
  return JSON.parse(await readFile(join(staticDirectory, 'manifest.json'), 'utf8')) as FixtureManifest
}

export const runBenchmark = async (options: BenchmarkOptions): Promise<BenchmarkSummary> => {
  const output = resolve(options.output)
  const staticDirectory = resolve(options.staticDirectory)
  const profileDirectory = join(output, 'profiles')
  const workspace = resolve('.tmp/workspace')
  const workspaceFile = join(workspace, 'benchmark.txt')
  await mkdir(profileDirectory, { recursive: true })
  const manifest = await readManifest(staticDirectory)
  const fixtures = options.editors.map((id) => getEditorFixture(manifest.editors, id))
  const staticServer = await startStaticServer(staticDirectory)
  let lvceServer: RunningLvceServer | undefined
  let browser: Browser | undefined
  const results: IterationResult[] = []
  try {
    lvceServer = options.editors.includes('lvce-editor') ? await startLvceServer(workspace, options.timeout) : undefined
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
          lvceServer,
          workspaceFile,
          iteration,
          warmup,
          options,
          profileDirectory,
        )
        results.push(result)
        const status = result.success ? `${result.typingDurationMs.toFixed(2)} ms` : 'failed'
        console.info(`${fixture.label} ${warmup ? 'warmup' : 'iteration'} ${iteration}: ${status}`)
      }
    }
  } finally {
    await browser?.close().catch(() => undefined)
    await lvceServer?.close().catch(() => undefined)
    await staticServer.close().catch(() => undefined)
  }
  const metadata: BenchmarkMetadata = {
    characters: options.characters,
    editors: fixtures,
  }
  await writeFile(join(output, 'benchmark.json'), `${JSON.stringify(metadata, undefined, 2)}\n`)
  await writeFile(join(output, 'iterations.json'), `${JSON.stringify(results, undefined, 2)}\n`)
  const summary = await analyzeResults(output, fixtures, options.characters)
  const failures = results.filter((result) => !result.warmup && !result.success)
  if (failures.length > 0) {
    const details = failures.map((failure) => `${failure.editor} #${failure.iteration}: ${failure.error || 'unknown error'}`).join('\n')
    throw new Error(`${failures.length} measured benchmark iteration(s) failed:\n${details}`)
  }
  console.info(`Wrote benchmark results to ${relative(process.cwd(), output) || output}`)
  return summary
}
