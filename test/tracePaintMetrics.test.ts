import assert from 'node:assert/strict'
import test from 'node:test'
import { getTracePaintMetrics } from '../src/tracePaintMetrics.ts'

test('summarizes main-frame paints after navigation commit', () => {
  assert.deepEqual(
    getTracePaintMetrics({
      traceEvents: [
        { name: 'Paint', ph: 'X', ts: 10, dur: 10, args: { data: { clip: [0, 0, 100, 0, 100, 100, 0, 100] } } },
        { name: 'CommitLoad', ph: 'X', ts: 20, args: { data: { frame: 'main', isMainFrame: true } } },
        { name: 'Paint', ph: 'X', ts: 30, dur: 1_000, args: { data: { clip: [0, 0, 40, 0, 40, 20, 0, 20], frame: 'main' } } },
        { name: 'Paint', ph: 'X', ts: 35, dur: 10_000, args: { data: { clip: [0, 0, 500, 0, 500, 500, 0, 500], frame: 'child' } } },
        { name: 'Paint', ph: 'X', ts: 40, dur: 500, args: { data: { clip: [0, 0, 10, 0, 10, 20, 0, 20], frame: 'main' } } },
      ],
    }),
    {
      largestPaintAreaPixels: 800,
      paintDurationMs: 1.5,
      paintedAreaPixels: 1_000,
      paintEventCount: 2,
    },
  )
})

test('rejects a trace without the measured navigation', () => {
  assert.throws(
    () => getTracePaintMetrics({ traceEvents: [] }),
    /Chromium trace did not contain a main-frame navigation commit/,
  )
})
