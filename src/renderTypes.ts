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
  readonly domContentLoadedMs: number | null
  readonly editor: EditorId
  readonly error?: string
  readonly gpuProcessMemoryBytes: number | null
  readonly iteration: number
  readonly javascriptHeapUsedBytes: number | null
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
  readonly domContentLoadedMs: Stats
  readonly failures: number
  readonly gpuProcessMemoryBytes: Stats
  readonly id: EditorId
  readonly iterations: number
  readonly javascriptDurationMs: Stats
  readonly javascriptHeapUsedBytes: Stats
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
