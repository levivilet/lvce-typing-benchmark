import assert from 'node:assert/strict'
import test from 'node:test'
import { getTypingLagSamples, summarizeTypingLag } from '../src/typingLag.ts'
import type { TraceEvent } from '../src/types.ts'

const mark = (name: string, ts: number): TraceEvent => ({ name: `typing-lag:1:${name}`, ts, pid: 1, tid: 2 })
const events: readonly TraceEvent[] = [
  mark('keydown', 1_000),
  // A cursor paint before the actual text is ready must not count.
  { name: 'LocalFrameView::RunPaintLifecyclePhase', ph: 'X', ts: 2_000, dur: 500, pid: 1, tid: 2 },
  { name: 'Paint', ts: 2_100, pid: 1, tid: 2, args: { data: { frame: 'main' } } },
  mark('dom', 10_000),
  { name: 'LocalFrameView::RunPaintLifecyclePhase', ph: 'X', ts: 12_000, dur: 2_000, pid: 1, tid: 2 },
  { name: 'Paint', ph: 'X', ts: 12_100, dur: 100, pid: 1, tid: 2, args: { data: { frame: 'main' } } },
  { name: 'Paint', ph: 'I', ts: 13_000, pid: 1, tid: 2, args: { data: { frame: 'main' } } },
  mark('settled', 30_000),
]

test('measures the whole paint lifecycle after text readiness, independent of trace order', () => {
  assert.deepEqual(getTypingLagSamples({ traceEvents: events.toReversed() }, 1, 'main'), [13])
})

test('rejects missing marks, duplicate marks, and reversed timestamps', () => {
  assert.throws(() => getTypingLagSamples({ traceEvents: [] }, 1, 'main'), /Expected one trace mark/)
  assert.throws(() => getTypingLagSamples({ traceEvents: [...events, mark('dom', 10_000)] }, 1, 'main'), /Expected one trace mark/)
  assert.throws(() => getTypingLagSamples({ traceEvents: events.map((event) => event.name?.endsWith(':dom') ? { ...event, ts: 500 } : event) }, 1, 'main'), /Invalid trace mark order/)
})

test('rejects missing paints, other frames, other threads, and paints after the sample boundary', () => {
  assert.throws(() => getTypingLagSamples({ traceEvents: events.filter((event) => event.name !== 'Paint') }, 1, 'main'), /No main-frame paint/)
  assert.throws(() => getTypingLagSamples({ traceEvents: events }, 1, 'iframe'), /No main-frame paint/)
  assert.throws(() => getTypingLagSamples({ traceEvents: events.map((event) => event.name === 'Paint' ? { ...event, tid: 3 } : event) }, 1, 'main'), /No main-frame paint/)
  assert.throws(() => getTypingLagSamples({ traceEvents: events.map((event) => event.name?.endsWith(':settled') ? { ...event, ts: 13_500 } : event) }, 1, 'main'), /No main-frame paint/)
})

test('aggregates individual samples with even and odd medians, and excludes failed passes', () => {
  const result = { editor: 'codemirror' as const, requestedSamples: 4, samplesMs: [8, 2, 4, 6], success: true, tracePath: 'trace.json' }
  assert.deepEqual(summarizeTypingLag(result), {
    samples: 4, requestedSamples: 4, failures: 0,
    durationMs: { min: 2, mean: 5, median: 5, max: 8, p95: 8 },
  })
  assert.equal(summarizeTypingLag({ ...result, samplesMs: [8, 2, 4] }).durationMs.median, 4)
  assert.deepEqual(summarizeTypingLag({ ...result, success: false }), {
    samples: 0, requestedSamples: 4, failures: 1,
    durationMs: { min: null, mean: null, median: null, max: null, p95: null },
  })
})
