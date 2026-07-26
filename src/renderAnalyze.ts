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
} from './renderTypes.ts'

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
