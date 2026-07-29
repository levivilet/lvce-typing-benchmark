import type { IdeFixture, IdeId, Stats } from './types.ts'

export interface StartupBenchmarkOptions {
  readonly headed: boolean
  readonly ides: readonly IdeId[]
  readonly iterations: number
  readonly output: string
  readonly profile: boolean
  readonly staticDirectory: string
  readonly timeout: number
  readonly warmups: number
}

export interface StartupIterationResult {
  readonly domContentLoadedMs: number | null
  readonly error?: string
  readonly ide: IdeId
  readonly iteration: number
  readonly profilePath?: string
  readonly startupDurationMs: number
  readonly success: boolean
  readonly warmup: boolean
}

export interface StartupBenchmarkMetadata {
  readonly ides: readonly IdeFixture[]
}

export interface StartupIdeSummary {
  readonly domContentLoadedMs: Stats
  readonly failures: number
  readonly id: IdeId
  readonly iterations: number
  readonly javascriptDurationMs: Stats
  readonly label: string
  readonly startupDurationMs: Stats
  readonly version: string
}

export interface StartupBenchmarkSummary {
  readonly generatedAt: string
  readonly ides: readonly StartupIdeSummary[]
}
