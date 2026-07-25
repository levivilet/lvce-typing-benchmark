import { basename } from 'node:path'
import type {
  CpuBreakdown,
  CpuExecutionContext,
  CpuFunctionHotspot,
  CpuProfileNode,
  TraceEvent,
  TraceProfile,
} from './types.ts'

interface MutableContext {
  readonly functions: Set<string>
  readonly kind: 'main' | 'worker'
  readonly name: string
  selfMicroseconds: number
}

interface MutableHotspot {
  readonly context: string
  readonly frame: CpuProfileNode['callFrame']
  inclusiveMicroseconds: number
  samples: number
  selfMicroseconds: number
}

interface ProfileData {
  readonly nodes: Map<number, CpuProfileNode>
  readonly samples: Array<{ readonly delta: number; readonly nodeId: number }>
}

const contextNames: Readonly<Record<string, string>> = {
  editorWorkerMain: 'Editor worker',
  extensionHostWorkerMain: 'Extension host worker',
  rendererProcessMain: 'Renderer process',
  rendererWorkerMain: 'Renderer worker',
  syntaxHighlightingWorkerMain: 'Syntax highlighting worker',
  textMeasurementWorkerMain: 'Text measurement worker',
}

const round = (value: number): number => {
  return Math.round(value * 1_000) / 1_000
}

const getProfileKey = (event: TraceEvent): string => {
  return `${event.pid ?? 0}:${event.id ?? event.tid ?? 0}`
}

const isLvceFrame = (node: CpuProfileNode | undefined): node is CpuProfileNode => {
  const url = node?.callFrame.url || ''
  return Boolean(node && url.includes('/packages/') && url.endsWith('.js'))
}

const getSource = (node: CpuProfileNode): string => {
  return basename(new URL(node.callFrame.url || '', 'http://localhost').pathname)
}

const getContext = (nodes: Iterable<CpuProfileNode>): { readonly kind: 'main' | 'worker'; readonly name: string } => {
  for (const node of nodes) {
    if (!isLvceFrame(node)) {
      continue
    }
    const source = getSource(node).replace(/\.js$/, '')
    return {
      kind: source === 'rendererProcessMain' ? 'main' : 'worker',
      name: contextNames[source] || source.replaceAll(/([a-z])([A-Z])/g, '$1 $2'),
    }
  }
  return { kind: 'worker', name: 'Other LVCE worker' }
}

const getHotspotKey = (context: string, node: CpuProfileNode): string => {
  const frame = node.callFrame
  return [
    context,
    frame.functionName,
    frame.url || '',
    frame.lineNumber || 0,
    frame.columnNumber || 0,
  ].join(':')
}

const getProfiles = (trace: TraceProfile): readonly ProfileData[] => {
  const profiles = new Map<string, ProfileData>()
  for (const event of trace.traceEvents) {
    if (event.name !== 'ProfileChunk') {
      continue
    }
    const key = getProfileKey(event)
    const profile = profiles.get(key) || {
      nodes: new Map<number, CpuProfileNode>(),
      samples: [],
    }
    const nodes = event.args?.data?.cpuProfile?.nodes || []
    for (const node of nodes) {
      profile.nodes.set(node.id, node)
    }
    const samples = event.args?.data?.cpuProfile?.samples || []
    const timeDeltas = event.args?.data?.timeDeltas || []
    for (let index = 0; index < samples.length; index++) {
      profile.samples.push({
        delta: timeDeltas[index] || 0,
        nodeId: samples[index] ?? -1,
      })
    }
    profiles.set(key, profile)
  }
  const results: ProfileData[] = []
  const values = profiles.values()
  for (const profile of values) {
    results.push(profile)
  }
  return results
}

const getStack = (nodes: ReadonlyMap<number, CpuProfileNode>, leafId: number): readonly CpuProfileNode[] => {
  const stack: CpuProfileNode[] = []
  const visited = new Set<number>()
  let node = nodes.get(leafId)
  while (node && !visited.has(node.id)) {
    stack.push(node)
    visited.add(node.id)
    node = node.parent === undefined ? undefined : nodes.get(node.parent)
  }
  return stack
}

const toShare = (value: number, total: number): number => {
  return total === 0 ? 0 : round((value / total) * 100)
}

const addInclusiveTime = (
  context: MutableContext,
  contextName: string,
  delta: number,
  hotspots: Map<string, MutableHotspot>,
  nodes: readonly CpuProfileNode[],
): void => {
  const matchedKeys = new Set<string>()
  for (const node of nodes) {
    const key = getHotspotKey(contextName, node)
    if (matchedKeys.has(key)) {
      continue
    }
    matchedKeys.add(key)
    context.functions.add(key)
    const hotspot = hotspots.get(key) || {
      context: contextName,
      frame: node.callFrame,
      inclusiveMicroseconds: 0,
      samples: 0,
      selfMicroseconds: 0,
    }
    hotspot.inclusiveMicroseconds += delta
    hotspots.set(key, hotspot)
  }
}

const analyzeProfile = (
  contexts: Map<string, MutableContext>,
  hotspots: Map<string, MutableHotspot>,
  profile: ProfileData,
): number => {
  const contextInfo = getContext(profile.nodes.values())
  const context = contexts.get(contextInfo.name) || {
    functions: new Set<string>(),
    ...contextInfo,
    selfMicroseconds: 0,
  }
  let selfMicroseconds = 0
  for (const sample of profile.samples) {
    if (sample.delta <= 0) {
      continue
    }
    const stack = getStack(profile.nodes, sample.nodeId)
    const leaf = stack[0]
    if (!leaf) {
      continue
    }
    const matchedNodes = stack.filter(isLvceFrame)
    addInclusiveTime(context, contextInfo.name, sample.delta, hotspots, matchedNodes)
    if (matchedNodes.length > 0) {
      contexts.set(context.name, context)
    }
    if (!isLvceFrame(leaf)) {
      continue
    }
    const hotspot = hotspots.get(getHotspotKey(contextInfo.name, leaf))
    if (!hotspot) {
      continue
    }
    hotspot.samples++
    hotspot.selfMicroseconds += sample.delta
    selfMicroseconds += sample.delta
    context.selfMicroseconds += sample.delta
  }
  return selfMicroseconds
}

const getContextResults = (
  contexts: ReadonlyMap<string, MutableContext>,
  divisor: number,
  totalMicroseconds: number,
): readonly CpuExecutionContext[] => {
  return Array.from(contexts.values(), (context) => ({
    functionCount: context.functions.size,
    kind: context.kind,
    name: context.name,
    selfMs: round(context.selfMicroseconds / divisor / 1_000),
    share: toShare(context.selfMicroseconds, totalMicroseconds),
  })).toSorted((left, right) => right.selfMs - left.selfMs)
}

const getHotspotResults = (
  hotspots: ReadonlyMap<string, MutableHotspot>,
  divisor: number,
  totalMicroseconds: number,
): readonly CpuFunctionHotspot[] => {
  return Array.from(hotspots.values(), (hotspot) => {
    const selfMs = round(hotspot.selfMicroseconds / divisor / 1_000)
    return {
      columnNumber: hotspot.frame.columnNumber || 0,
      context: hotspot.context,
      functionName: hotspot.frame.functionName || '(anonymous)',
      inclusiveMs: round(hotspot.inclusiveMicroseconds / divisor / 1_000),
      lineNumber: hotspot.frame.lineNumber || 0,
      samples: round(hotspot.samples / divisor),
      selfMs,
      share: toShare(hotspot.selfMicroseconds, totalMicroseconds),
      source: getSource({ id: 0, callFrame: hotspot.frame }),
    }
  }).toSorted((left, right) => right.selfMs - left.selfMs || right.inclusiveMs - left.inclusiveMs)
}

export const analyzeCpuBreakdown = (traces: readonly TraceProfile[]): CpuBreakdown => {
  const contexts = new Map<string, MutableContext>()
  const hotspots = new Map<string, MutableHotspot>()
  let lvceJavaScriptMicroseconds = 0
  for (const trace of traces) {
    for (const profile of getProfiles(trace)) {
      lvceJavaScriptMicroseconds += analyzeProfile(contexts, hotspots, profile)
    }
  }
  const iterations = traces.length
  const divisor = Math.max(1, iterations)
  const lvceJavaScriptMs = round(lvceJavaScriptMicroseconds / divisor / 1_000)
  return {
    contexts: getContextResults(contexts, divisor, lvceJavaScriptMicroseconds),
    hotspots: getHotspotResults(hotspots, divisor, lvceJavaScriptMicroseconds),
    iterations,
    lvceJavaScriptMs,
  }
}
