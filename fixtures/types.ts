export interface TypingBenchmarkAdapter {
  readonly focus: () => void
  readonly getText: () => string
}

declare global {
  interface Window {
    __typingBenchmark?: TypingBenchmarkAdapter
  }
}

export const markReady = (adapter: TypingBenchmarkAdapter, renderMode = false): void => {
  window.__typingBenchmark = adapter
  document.documentElement.dataset.benchmarkReady = 'true'
  if (!renderMode) {
    return
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      performance.mark('syntax-highlight-rendered')
      document.documentElement.dataset.renderBenchmarkReady = 'true'
    })
  })
}
