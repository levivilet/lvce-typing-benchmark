import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getJavaScriptDurationMs } from './analyze.ts'
import { ideLabels } from './ides.ts'
import { computeStats } from './stats.ts'
import type {
  StartupBenchmarkMetadata,
  StartupBenchmarkSummary,
  StartupIterationResult,
  StartupTraceBreakdown,
} from './startupTypes.ts'
import type { Stats, TraceEvent, TraceProfile } from './types.ts'

interface TraceMetrics {
  readonly compileParseMs: number
  readonly compiledModuleCount: number
  readonly dedicatedWorkerThreadCount: number
  readonly garbageCollectionMs: number
  readonly largestScriptBytes: number
  readonly largestScriptTransferMs: number
  readonly messageHandlingMs: number
  readonly profilerStartCount: number
  readonly profilerStartupMs: number
  readonly renderMs: number
  readonly requestCount: number
  readonly totalResourceBytes: number
  readonly v8InitializationMs: number
}

interface TraceResource {
  decodedBodyLength: number
  finishTimestamp?: number
  resourceType?: string
  startTimestamp?: number
}

type DurationCategory =
  | 'compileParseMs'
  | 'garbageCollectionMs'
  | 'messageHandlingMs'
  | 'profilerStartupMs'
  | 'renderMs'
  | 'v8InitializationMs'

interface Interval {
  readonly end: number
  readonly start: number
}

const compileParseEvents = new Set([
  'AnimationFrame::Script::Compile',
  'v8.compile',
  'v8.compileModule',
  'v8.parseOnBackgroundParsing',
])

const renderEvents = new Set([
  'Layerize',
  'Layout',
  'Paint',
  'ParseAuthorStyleSheet',
  'ParseHTML',
  'PrePaint',
  'UpdateLayoutTree',
])

const v8InitializationEvents = new Set([
  'LocalWindowProxy::CreateContext',
  'LocalWindowProxy::Initialize',
  'V8.DeserializeContext',
  'V8.DeserializeIsolate',
  'V8PerIsolateData::Initialize',
])

const getDurationCategory = (name: string): DurationCategory | undefined => {
  if (compileParseEvents.has(name)) {
    return 'compileParseMs'
  }
  if (name === 'CpuProfiler::StartProfiling') {
    return 'profilerStartupMs'
  }
  if (v8InitializationEvents.has(name)) {
    return 'v8InitializationMs'
  }
  if (name === 'MinorGC' || name === 'MajorGC' || name.startsWith('V8.GC')) {
    return 'garbageCollectionMs'
  }
  if (renderEvents.has(name)) {
    return 'renderMs'
  }
  if (name === 'HandlePostMessage') {
    return 'messageHandlingMs'
  }
}

const sumIntervalUnionMs = (intervalsByThread: ReadonlyMap<string, readonly Interval[]>): number => {
  let totalMicroseconds = 0
  for (const intervals of intervalsByThread.values()) {
    const sorted = intervals.toSorted((a, b) => a.start - b.start)
    let currentStart = -1
    let currentEnd = -1
    for (const interval of sorted) {
      if (interval.start > currentEnd) {
        totalMicroseconds += Math.max(0, currentEnd - currentStart)
        currentStart = interval.start
        currentEnd = interval.end
      } else {
        currentEnd = Math.max(currentEnd, interval.end)
      }
    }
    totalMicroseconds += Math.max(0, currentEnd - currentStart)
  }
  return totalMicroseconds / 1_000
}

const addInterval = (
  intervals: Map<DurationCategory, Map<string, Interval[]>>,
  category: DurationCategory,
  event: TraceEvent,
): void => {
  if (!event.dur || event.ts === undefined || event.dur < 0) {
    return
  }
  const intervalsByThread = intervals.get(category) || new Map<string, Interval[]>()
  const thread = `${event.pid ?? 0}:${event.tid ?? 0}`
  const threadIntervals = intervalsByThread.get(thread) || []
  threadIntervals.push({ start: event.ts, end: event.ts + event.dur })
  intervalsByThread.set(thread, threadIntervals)
  intervals.set(category, intervalsByThread)
}

const addResourceEvent = (resources: Map<number | string, TraceResource>, event: TraceEvent): void => {
  const data = event.args?.data
  if (!data || data.requestId === undefined) {
    return
  }
  const { requestId } = data
  if (event.name === 'ResourceSendRequest') {
    const resource = resources.get(requestId) || { decodedBodyLength: 0 }
    resource.resourceType = data.resourceType
    resource.startTimestamp = event.ts
    resources.set(requestId, resource)
  } else if (event.name === 'ResourceFinish') {
    const resource = resources.get(requestId) || { decodedBodyLength: 0 }
    resource.decodedBodyLength = data.decodedBodyLength ?? data.encodedDataLength ?? 0
    resource.finishTimestamp = event.ts
    resources.set(requestId, resource)
  }
}

export const analyzeStartupTrace = (trace: TraceProfile): TraceMetrics => {
  const intervals = new Map<DurationCategory, Map<string, Interval[]>>()
  const dedicatedWorkerThreads = new Set<string>()
  const resources = new Map<number | string, TraceResource>()
  let compiledModuleCount = 0
  let profilerStartCount = 0

  for (const event of trace.traceEvents) {
    const name = event.name || ''
    const category = getDurationCategory(name)
    if (category) {
      addInterval(intervals, category, event)
    }
    compiledModuleCount += Number(name === 'v8.compileModule')
    profilerStartCount += Number(name === 'CpuProfiler::StartProfiling')
    if (
      event.ph === 'M' &&
      name === 'thread_name' &&
      event.args?.name === 'DedicatedWorker thread'
    ) {
      dedicatedWorkerThreads.add(`${event.pid ?? 0}:${event.tid ?? 0}`)
    }
    addResourceEvent(resources, event)
  }

  const completedResources: TraceResource[] = []
  for (const resource of resources.values()) {
    if (resource.finishTimestamp !== undefined && resource.startTimestamp !== undefined) {
      completedResources.push(resource)
    }
  }
  const largestScript = completedResources
    .filter((resource) => resource.resourceType === 'Script')
    .toSorted((a, b) => b.decodedBodyLength - a.decodedBodyLength)[0]
  const largestScriptTransferMs =
    largestScript?.startTimestamp === undefined || largestScript.finishTimestamp === undefined
      ? 0
      : Math.max(0, largestScript.finishTimestamp - largestScript.startTimestamp) / 1_000
  const getDuration = (category: DurationCategory): number => {
    return sumIntervalUnionMs(intervals.get(category) || new Map())
  }
  return {
    compileParseMs: getDuration('compileParseMs'),
    compiledModuleCount,
    dedicatedWorkerThreadCount: dedicatedWorkerThreads.size,
    garbageCollectionMs: getDuration('garbageCollectionMs'),
    largestScriptBytes: largestScript?.decodedBodyLength || 0,
    largestScriptTransferMs,
    messageHandlingMs: getDuration('messageHandlingMs'),
    profilerStartCount,
    profilerStartupMs: getDuration('profilerStartupMs'),
    renderMs: getDuration('renderMs'),
    requestCount: completedResources.length,
    totalResourceBytes: completedResources.reduce((total, resource) => total + resource.decodedBodyLength, 0),
    v8InitializationMs: getDuration('v8InitializationMs'),
  }
}

const computeTraceBreakdown = (
  results: readonly StartupIterationResult[],
  metrics: readonly TraceMetrics[],
): StartupTraceBreakdown => {
  const getStats = (getValue: (metric: TraceMetrics) => number): Stats => {
    return computeStats(metrics.map(getValue))
  }
  return {
    compileParseMs: getStats((metric) => metric.compileParseMs),
    compiledModuleCount: getStats((metric) => metric.compiledModuleCount),
    dedicatedWorkerThreadCount: getStats((metric) => metric.dedicatedWorkerThreadCount),
    garbageCollectionMs: getStats((metric) => metric.garbageCollectionMs),
    largestScriptBytes: getStats((metric) => metric.largestScriptBytes),
    largestScriptTransferMs: getStats((metric) => metric.largestScriptTransferMs),
    messageHandlingMs: getStats((metric) => metric.messageHandlingMs),
    postDomContentLoadedMs: computeStats(
      results.flatMap((result) =>
        result.domContentLoadedMs === null ? [] : [result.startupDurationMs - result.domContentLoadedMs],
      ),
    ),
    profilerStartCount: getStats((metric) => metric.profilerStartCount),
    profilerStartupMs: getStats((metric) => metric.profilerStartupMs),
    renderMs: getStats((metric) => metric.renderMs),
    requestCount: getStats((metric) => metric.requestCount),
    totalResourceBytes: getStats((metric) => metric.totalResourceBytes),
    v8InitializationMs: getStats((metric) => metric.v8InitializationMs),
  }
}

export const analyzeStartupResults = async (input: string): Promise<StartupBenchmarkSummary> => {
  const metadata = JSON.parse(await readFile(join(input, 'benchmark.json'), 'utf8')) as StartupBenchmarkMetadata
  const results = JSON.parse(await readFile(join(input, 'iterations.json'), 'utf8')) as readonly StartupIterationResult[]
  const measuredResults = results.filter((result) => !result.warmup)
  const ides = await Promise.all(
    metadata.ides.map(async (fixture) => {
      const ideResults = measuredResults.filter((result) => result.ide === fixture.id)
      const successfulResults = ideResults.filter((result) => result.success)
      const traceResults = (
        await Promise.all(
          successfulResults.map(async (result) => {
            if (!result.profilePath) {
              return null
            }
            const trace = JSON.parse(await readFile(join(input, result.profilePath), 'utf8')) as TraceProfile
            return {
              javascriptDurationMs: getJavaScriptDurationMs(trace),
              traceMetrics: analyzeStartupTrace(trace),
            }
          }),
        )
      ).filter((value): value is { javascriptDurationMs: number; traceMetrics: TraceMetrics } => value !== null)
      return {
        domContentLoadedMs: computeStats(
          successfulResults.flatMap((result) => (result.domContentLoadedMs === null ? [] : [result.domContentLoadedMs])),
        ),
        failures: ideResults.length - successfulResults.length,
        id: fixture.id,
        iterations: ideResults.length,
        javascriptDurationMs: computeStats(traceResults.map((result) => result.javascriptDurationMs)),
        label: fixture.label || ideLabels[fixture.id],
        startupDurationMs: computeStats(successfulResults.map((result) => result.startupDurationMs)),
        traceBreakdown: computeTraceBreakdown(
          successfulResults,
          traceResults.map((result) => result.traceMetrics),
        ),
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
