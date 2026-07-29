import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { editorLabels } from './editors.ts'
import { analyzeCpuBreakdown } from './cpuBreakdown.ts'
import { computeStats } from './stats.ts'
import type { BenchmarkSummary, CpuProfileNode, EditorFixture, EditorId, IterationResult, TraceEvent, TraceProfile } from './types.ts'

const specialFunctions = new Set(['(garbage collector)', '(idle)', '(program)', '(root)'])

const getProfileKey = (event: TraceEvent): string => {
  return `${event.pid ?? 0}:${event.id ?? event.tid ?? 0}`
}

const isJavaScriptNode = (node: CpuProfileNode | undefined): boolean => {
  return Boolean(node && !specialFunctions.has(node.callFrame.functionName))
}

export const getJavaScriptDurationMs = (trace: TraceProfile): number => {
  const nodeMaps = new Map<string, Map<number, CpuProfileNode>>()
  for (const event of trace.traceEvents) {
    if (event.name !== 'ProfileChunk') {
      continue
    }
    const nodes = event.args?.data?.cpuProfile?.nodes || []
    const key = getProfileKey(event)
    const nodeMap = nodeMaps.get(key) || new Map<number, CpuProfileNode>()
    for (const node of nodes) {
      nodeMap.set(node.id, node)
    }
    nodeMaps.set(key, nodeMap)
  }

  let totalMicroseconds = 0
  for (const event of trace.traceEvents) {
    if (event.name !== 'ProfileChunk') {
      continue
    }
    const samples = event.args?.data?.cpuProfile?.samples || []
    const timeDeltas = event.args?.data?.timeDeltas || []
    const nodeMap = nodeMaps.get(getProfileKey(event))
    for (let index = 0; index < samples.length; index++) {
      const delta = timeDeltas[index] || 0
      if (delta > 0 && isJavaScriptNode(nodeMap?.get(samples[index] ?? -1))) {
        totalMicroseconds += delta
      }
    }
  }
  return totalMicroseconds / 1_000
}

export const analyzeResults = async (
  input: string,
  fixtures: readonly EditorFixture[],
  characters: number,
): Promise<BenchmarkSummary> => {
  const results = JSON.parse(await readFile(join(input, 'iterations.json'), 'utf8')) as readonly IterationResult[]
  const traceCache = new Map<string, Promise<TraceProfile>>()
  const readTrace = (result: IterationResult): Promise<TraceProfile | null> => {
    if (!result.profilePath) {
      return Promise.resolve(null)
    }
    const cached = traceCache.get(result.profilePath)
    if (cached) {
      return cached
    }
    const trace = readFile(join(input, result.profilePath), 'utf8').then(
      (value) => JSON.parse(value) as TraceProfile,
    )
    traceCache.set(result.profilePath, trace)
    return trace
  }
  const measuredResults = results.filter((result) => !result.warmup)
  const editorIds = [...new Set(measuredResults.map((result) => result.editor))]
  const editors = await Promise.all(
    editorIds.map(async (id: EditorId) => {
      const editorResults = measuredResults.filter((result) => result.editor === id)
      const successfulResults = editorResults.filter((result) => result.success)
      const javascriptDurations = (
        await Promise.all(
          successfulResults.map(async (result) => {
            const trace = await readTrace(result)
            return trace ? getJavaScriptDurationMs(trace) : null
          }),
        )
      ).filter((value): value is number => value !== null)
      const fixture = fixtures.find((candidate) => candidate.id === id)
      return {
        id,
        label: fixture?.label || editorLabels[id],
        version: fixture?.version || 'unknown',
        iterations: editorResults.length,
        failures: editorResults.length - successfulResults.length,
        characters,
        typingDurationMs: computeStats(successfulResults.map((result) => result.typingDurationMs)),
        javascriptDurationMs: computeStats(javascriptDurations),
      }
    }),
  )
  const summary: BenchmarkSummary = {
    generatedAt: new Date().toISOString(),
    characters,
    editors,
  }
  const lvceResults = measuredResults.filter((result) => result.editor === 'lvce-editor-minimal' && result.success)
  const lvceTraces = (
    await Promise.all(lvceResults.map(async (result) => readTrace(result)))
  ).filter((trace): trace is TraceProfile => trace !== null)
  const cpuBreakdown = analyzeCpuBreakdown(lvceTraces)
  await Promise.all([
    writeFile(join(input, 'summary.json'), `${JSON.stringify(summary, undefined, 2)}\n`),
    writeFile(join(input, 'cpu-breakdown.json'), `${JSON.stringify(cpuBreakdown, undefined, 2)}\n`),
  ])
  return summary
}
