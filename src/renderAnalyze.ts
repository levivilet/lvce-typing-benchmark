import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getJavaScriptDurationMs } from './analyze.ts'
import { editorLabels } from './editors.ts'
import { computeStats } from './stats.ts'
import type { TraceProfile } from './types.ts'
import type {
  RenderBenchmarkMetadata,
  RenderBenchmarkSummary,
  RenderIterationResult,
  PaintCommandSummary,
} from './renderTypes.ts'

const summarizePaintCommands = (results: readonly RenderIterationResult[]): readonly PaintCommandSummary[] => {
  const iterations = results.flatMap((result) => (result.paintCommands ? [result.paintCommands] : []))
  const methods = new Set(iterations.flatMap((commands) => commands.map((command) => command.method)))
  return Array.from(methods, (method) => ({
      count: computeStats(
        iterations.map((commands) => commands.find((command) => command.method === method)?.count ?? 0),
      ),
      method,
    })).toSorted((a, b) => (b.count.mean ?? 0) - (a.count.mean ?? 0) || a.method.localeCompare(b.method))
}

export const analyzeRenderResults = async (input: string): Promise<RenderBenchmarkSummary> => {
  const metadata = JSON.parse(await readFile(join(input, 'benchmark.json'), 'utf8')) as RenderBenchmarkMetadata
  const results = JSON.parse(await readFile(join(input, 'iterations.json'), 'utf8')) as readonly RenderIterationResult[]
  const measuredResults = results.filter((result) => !result.warmup)
  const editors = await Promise.all(
    metadata.editors.map(async (fixture) => {
      const editorResults = measuredResults.filter((result) => result.editor === fixture.id)
      const successfulResults = editorResults.filter((result) => result.success)
      const javascriptDurations = (
        await Promise.all(
          successfulResults.map(async (result) => {
            if (!result.profilePath) {
              return null
            }
            const trace = JSON.parse(await readFile(join(input, result.profilePath), 'utf8')) as TraceProfile
            return getJavaScriptDurationMs(trace)
          }),
        )
      ).filter((value): value is number => value !== null)
      return {
        id: fixture.id,
        label: fixture.label || editorLabels[fixture.id],
        version: fixture.version,
        iterations: editorResults.length,
        failures: editorResults.length - successfulResults.length,
        paintEventCount: computeStats(
          successfulResults.flatMap((result) => (result.paintEventCount === null ? [] : [result.paintEventCount])),
        ),
        paintedAreaPixels: computeStats(
          successfulResults.flatMap((result) => (result.paintedAreaPixels === null ? [] : [result.paintedAreaPixels])),
        ),
        largestPaintAreaPixels: computeStats(
          successfulResults.flatMap((result) => (result.largestPaintAreaPixels === null ? [] : [result.largestPaintAreaPixels])),
        ),
        paintCommandCount: computeStats(
          successfulResults.flatMap((result) => (result.paintCommandCount === null ? [] : [result.paintCommandCount])),
        ),
        paintCommands: summarizePaintCommands(successfulResults),
        paintDurationMs: computeStats(
          successfulResults.flatMap((result) => (result.paintDurationMs === null ? [] : [result.paintDurationMs])),
        ),
        layerCount: computeStats(
          successfulResults.flatMap((result) => (result.layerCount === null ? [] : [result.layerCount])),
        ),
        contentLayerCount: computeStats(
          successfulResults.flatMap((result) => (result.contentLayerCount === null ? [] : [result.contentLayerCount])),
        ),
        domContentLoadedMs: computeStats(
          successfulResults.flatMap((result) => (result.domContentLoadedMs === null ? [] : [result.domContentLoadedMs])),
        ),
        renderDurationMs: computeStats(successfulResults.map((result) => result.renderDurationMs)),
        javascriptDurationMs: computeStats(javascriptDurations),
        javascriptHeapUsedBytes: computeStats(
          successfulResults.flatMap((result) => (result.javascriptHeapUsedBytes === null ? [] : [result.javascriptHeapUsedBytes])),
        ),
        rendererProcessMemoryBytes: computeStats(
          successfulResults.flatMap((result) => (result.rendererProcessMemoryBytes === null ? [] : [result.rendererProcessMemoryBytes])),
        ),
        gpuProcessMemoryBytes: computeStats(
          successfulResults.flatMap((result) => (result.gpuProcessMemoryBytes === null ? [] : [result.gpuProcessMemoryBytes])),
        ),
      }
    }),
  )
  const summary: RenderBenchmarkSummary = {
    document: metadata.document,
    editors,
    generatedAt: new Date().toISOString(),
    lines: metadata.lines,
  }
  await writeFile(join(input, 'summary.json'), `${JSON.stringify(summary, undefined, 2)}\n`)
  return summary
}
