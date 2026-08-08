import type { EditorFixture, EditorId, Stats } from './types.ts'

export interface RenderBenchmarkOptions {
  readonly editors: readonly EditorId[]
  readonly headed: boolean
  readonly iterations: number
  readonly output: string
  readonly profile: boolean
  readonly staticDirectory: string
  readonly timeout: number
  readonly warmups: number
}

export interface RenderIterationResult {
  readonly contentLayerAreaPixels: number | null
  readonly contentLayerCount: number | null
  readonly domContentLoadedMs: number | null
  readonly editor: EditorId
  readonly error?: string
  readonly gpuProcessMemoryBytes: number | null
  readonly iteration: number
  readonly javascriptHeapUsedBytes: number | null
  readonly largestPaintAreaPixels: number | null
  readonly layerCount: number | null
  readonly paintCommandCount: number | null
  readonly paintDurationMs: number | null
  readonly paintedAreaPixels: number | null
  readonly paintEventCount: number | null
  readonly profilePath?: string
  readonly rendererProcessMemoryBytes: number | null
  readonly renderDurationMs: number
  readonly success: boolean
  readonly warmup: boolean
}

export interface RenderBenchmarkMetadata {
  readonly document: string
  readonly editors: readonly EditorFixture[]
  readonly lines: number
}

export interface RenderEditorSummary {
  readonly contentLayerAreaPixels: Stats
  readonly contentLayerCount: Stats
  readonly domContentLoadedMs: Stats
  readonly failures: number
  readonly gpuProcessMemoryBytes: Stats
  readonly id: EditorId
  readonly iterations: number
  readonly javascriptDurationMs: Stats
  readonly javascriptHeapUsedBytes: Stats
  readonly largestPaintAreaPixels: Stats
  readonly layerCount: Stats
  readonly paintCommandCount: Stats
  readonly paintDurationMs: Stats
  readonly paintedAreaPixels: Stats
  readonly paintEventCount: Stats
  readonly label: string
  readonly rendererProcessMemoryBytes: Stats
  readonly renderDurationMs: Stats
  readonly version: string
}

export interface RenderBenchmarkSummary {
  readonly document: string
  readonly editors: readonly RenderEditorSummary[]
  readonly generatedAt: string
  readonly lines: number
}
