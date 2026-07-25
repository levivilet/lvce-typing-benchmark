export interface TypingBenchmarkAdapter {
  readonly focus: () => void
  readonly getText: () => string
}

declare global {
  interface Window {
    __typingBenchmark?: TypingBenchmarkAdapter
  }
}

export const markReady = (adapter: TypingBenchmarkAdapter): void => {
  window.__typingBenchmark = adapter
  document.documentElement.dataset.benchmarkReady = 'true'
}
