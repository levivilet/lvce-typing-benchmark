import type { Page } from 'playwright'
import { computeStats } from './stats.ts'
import type { EditorId, Stats, TraceEvent, TraceProfile } from './types.ts'

export const typingLagCadence = 'varied-16-65ms-v2'

export const getTypingLagPauseMs = (sample: number): number => {
  // A golden-ratio sequence covers the pause range without randomness or refresh synchronization.
  // Every editor gets the same reproducible sequence, independently of its typing speed.
  const phase = (sample * 0.6180339887498949) % 1
  return 16 + Math.floor(phase * 50)
}

export interface TypingLagResult {
  readonly cadence?: typeof typingLagCadence
  readonly editor: EditorId
  readonly requestedSamples: number
  readonly samplesMs: readonly number[]
  readonly success: boolean
  readonly tracePath: string
  readonly error?: string
}

export interface TypingLagSummary {
  readonly cadence?: typeof typingLagCadence
  readonly samples: number
  readonly requestedSamples: number
  readonly failures: number
  readonly durationMs: Stats & { readonly median: number | null }
}

const renderedTextSelectors: Readonly<Record<EditorId, string>> = {
  'lvce-editor-minimal': '.EditorRow',
  'lvce-editor-single-thread': '.EditorRow',
  'monaco-editor': '.view-lines .view-line',
  codemirror: '.cm-content .cm-line',
  codemirror5: '.CodeMirror-code .CodeMirror-line',
  'codejar-prism': '#editor',
  'ace-editor': '.ace_text-layer .ace_line',
}

// Arm before dispatch, and observe the visible text DOM rather than the editor model.
export const armTypingLagSample = async (page: Page, editor: EditorId, sample: number, timeout: number): Promise<void> => {
  await page.evaluate(({ selector, sample, timeout }) => {
    document.documentElement.dataset.typingLagSettled = ''
    let frame = 0
    let started = false
    let rendered = false
    const prefix = `typing-lag:${sample}`
    const observer = new MutationObserver(() => {
      if (!started || rendered) {
        return
      }
      const text = Array.from(document.querySelectorAll(selector), (line) => line.textContent || '').join('')
      if (text !== 'a'.repeat(sample)) {
        return
      }
      rendered = true
      performance.mark(`${prefix}:dom`)
      observer.disconnect()
      // These frames bound the trace search; their callback time is not the latency metric.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          performance.mark(`${prefix}:settled`)
          clearTimeout(timer)
          document.documentElement.dataset.typingLagSettled = String(sample)
        })
      })
    })
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'a' || !event.isTrusted) {
        return
      }
      started = true
      performance.mark(`${prefix}:keydown`, { startTime: event.timeStamp })
      globalThis.removeEventListener('keydown', onKeyDown, true)
    }
    const timer = setTimeout(() => {
      observer.disconnect()
      globalThis.removeEventListener('keydown', onKeyDown, true)
      cancelAnimationFrame(frame)
      document.documentElement.dataset.typingLagSettled = 'timeout'
    }, timeout)
    observer.observe(document.body, { childList: true, characterData: true, subtree: true })
    globalThis.addEventListener('keydown', onKeyDown, { capture: true })
  }, { selector: renderedTextSelectors[editor], sample, timeout })
}

const getMark = (events: readonly TraceEvent[], name: string): TraceEvent => {
  const matches = events.filter((event) => event.name === name && Number.isFinite(event.ts))
  if (matches.length !== 1) {
    throw new Error(`Expected one trace mark ${name}, got ${matches.length}`)
  }
  return matches[0]!
}

export const getTypingLagSamples = ({ traceEvents }: TraceProfile, count: number, mainFrame: string): readonly number[] => {
  const samples: number[] = []
  for (let sample = 1; sample <= count; sample++) {
    const prefix = `typing-lag:${sample}`
    const keydown = getMark(traceEvents, `${prefix}:keydown`)
    const dom = getMark(traceEvents, `${prefix}:dom`)
    const settled = getMark(traceEvents, `${prefix}:settled`)
    if (keydown.ts! > dom.ts! || dom.ts! >= settled.ts! || keydown.pid !== dom.pid || keydown.tid !== dom.tid) {
      throw new Error(`Invalid trace mark order for ${prefix}`)
    }
    // Paint lifecycle completion includes all repainted layers, not just the first Paint event.
    const paint = traceEvents.filter((event) =>
      event.name === 'LocalFrameView::RunPaintLifecyclePhase' && event.ph === 'X' &&
      event.pid === dom.pid && event.tid === dom.tid &&
      event.ts! >= dom.ts! && Number.isFinite(event.dur) && event.dur! >= 0 &&
      event.ts! + event.dur! <= settled.ts! &&
      traceEvents.some((candidate) => candidate.name === 'Paint' &&
        candidate.pid === dom.pid && candidate.tid === dom.tid && candidate.args?.data?.frame === mainFrame &&
        candidate.ts! >= event.ts! && candidate.ts! <= event.ts! + event.dur!),
    ).toSorted((a, b) => a.ts! - b.ts!)[0]
    if (!paint) {
      throw new Error(`No main-frame paint after the text update for ${prefix}`)
    }
    samples.push((paint.ts! + paint.dur! - keydown.ts!) / 1_000)
  }
  return samples
}

export const summarizeTypingLag = (result: TypingLagResult): TypingLagSummary => {
  const values = result.success ? result.samplesMs.toSorted((a, b) => a - b) : []
  const middle = Math.floor(values.length / 2)
  let median: number | null = null
  if (values.length > 0) {
    median = values.length % 2 === 0 ? (values[middle - 1]! + values[middle]!) / 2 : values[middle]!
  }
  return {
    ...(result.cadence ? { cadence: result.cadence } : {}),
    samples: values.length,
    requestedSamples: result.requestedSamples,
    failures: result.success ? 0 : 1,
    durationMs: { ...computeStats(values), median },
  }
}
