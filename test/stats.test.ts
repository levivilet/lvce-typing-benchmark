import assert from 'node:assert/strict'
import test from 'node:test'
import { computeStats } from '../src/stats.ts'

test('computes aggregate statistics', () => {
  assert.deepEqual(computeStats([4, 1, 3, 2]), {
    mean: 2.5,
    min: 1,
    max: 4,
    p95: 4,
  })
})

test('returns null statistics for no values', () => {
  assert.deepEqual(computeStats([]), {
    mean: null,
    min: null,
    max: null,
    p95: null,
  })
})
