import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getJavaScriptDurationMs } from './analyze.ts'
import { ideLabels } from './ides.ts'
import { computeStats } from './stats.ts'
import type {
  StartupBenchmarkMetadata,
  StartupBenchmarkSummary,
  StartupIterationResult,
} from './startupTypes.ts'
import type { TraceProfile } from './types.ts'

export const analyzeStartupResults = async (input: string): Promise<StartupBenchmarkSummary> => {
  const metadata = JSON.parse(await readFile(join(input, 'benchmark.json'), 'utf8')) as StartupBenchmarkMetadata
  const results = JSON.parse(await readFile(join(input, 'iterations.json'), 'utf8')) as readonly StartupIterationResult[]
  const measuredResults = results.filter((result) => !result.warmup)
  const ides = await Promise.all(
    metadata.ides.map(async (fixture) => {
      const ideResults = measuredResults.filter((result) => result.ide === fixture.id)
      const successfulResults = ideResults.filter((result) => result.success)
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
        domContentLoadedMs: computeStats(
          successfulResults.flatMap((result) => (result.domContentLoadedMs === null ? [] : [result.domContentLoadedMs])),
        ),
        failures: ideResults.length - successfulResults.length,
        id: fixture.id,
        iterations: ideResults.length,
        javascriptDurationMs: computeStats(javascriptDurations),
        label: fixture.label || ideLabels[fixture.id],
        startupDurationMs: computeStats(successfulResults.map((result) => result.startupDurationMs)),
        version: fixture.version,
      }
    }),
  )
  const summary: StartupBenchmarkSummary = {
    generatedAt: new Date().toISOString(),
    ides,
  }
  await writeFile(join(input, 'summary.json'), `${JSON.stringify(summary, undefined, 2)}\n`)
  return summary
}
