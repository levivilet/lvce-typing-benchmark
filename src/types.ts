export type EditorId = 'lvce-editor-minimal' | 'monaco-editor' | 'codemirror'

export type IdeId = 'lvce-editor' | 'vscode'

export interface EditorFixture {
  readonly id: EditorId
  readonly label: string
  readonly version: string
  readonly kind: 'static'
  readonly path: string
}

export interface IdeFixture {
  readonly id: IdeId
  readonly label: string
  readonly version: string
  readonly kind: 'lvce' | 'static'
  readonly path: string
}

export interface FixtureManifest {
  readonly generatedAt: string
  readonly editors: readonly EditorFixture[]
  readonly ides: readonly IdeFixture[]
}

export interface BenchmarkMetadata {
  readonly characters: number
  readonly editors: readonly EditorFixture[]
}

export interface BenchmarkOptions {
  readonly characters: number
  readonly editors: readonly EditorId[]
  readonly headed: boolean
  readonly iterations: number
  readonly output: string
  readonly profile: boolean
  readonly staticDirectory: string
  readonly timeout: number
  readonly warmups: number
}

export interface IterationResult {
  readonly editor: EditorId
  readonly iteration: number
  readonly profilePath?: string
  readonly success: boolean
  readonly typingDurationMs: number
  readonly warmup: boolean
  readonly error?: string
}

export interface Stats {
  readonly mean: number | null
  readonly min: number | null
  readonly max: number | null
  readonly p95: number | null
}

export interface EditorSummary {
  readonly id: EditorId
  readonly label: string
  readonly version: string
  readonly iterations: number
  readonly failures: number
  readonly characters: number
  readonly typingDurationMs: Stats
  readonly javascriptDurationMs: Stats
}

export interface BenchmarkSummary {
  readonly generatedAt: string
  readonly characters: number
  readonly editors: readonly EditorSummary[]
}

export interface TraceEvent {
  readonly args?: {
    readonly name?: string
    readonly data?: {
      readonly cpuProfile?: {
        readonly nodes?: readonly CpuProfileNode[]
        readonly samples?: readonly number[]
      }
      readonly timeDeltas?: readonly number[]
    }
  }
  readonly id?: string
  readonly name?: string
  readonly pid?: number
  readonly tid?: number
}

export interface CpuProfileNode {
  readonly id: number
  readonly parent?: number
  readonly callFrame: {
    readonly codeType?: string
    readonly columnNumber?: number
    readonly functionName: string
    readonly lineNumber?: number
    readonly scriptId: string
    readonly url?: string
  }
}

export interface TraceProfile {
  readonly traceEvents: readonly TraceEvent[]
}

export interface CpuFunctionHotspot {
  readonly columnNumber: number
  readonly context: string
  readonly functionName: string
  readonly inclusiveMs: number
  readonly lineNumber: number
  readonly samples: number
  readonly selfMs: number
  readonly share: number
  readonly source: string
}

export interface CpuExecutionContext {
  readonly functionCount: number
  readonly kind: 'main' | 'worker'
  readonly name: string
  readonly selfMs: number
  readonly share: number
}

export interface CpuBreakdown {
  readonly contexts: readonly CpuExecutionContext[]
  readonly hotspots: readonly CpuFunctionHotspot[]
  readonly iterations: number
  readonly lvceJavaScriptMs: number
}
