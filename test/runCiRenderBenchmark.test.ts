import assert from 'node:assert/strict'
import test from 'node:test'
import { getCiRenderBenchmarkArgs } from '../src/runCiRenderBenchmark.ts'

test('builds full render benchmark CI arguments by default', () => {
  assert.deepEqual(getCiRenderBenchmarkArgs({}), [
    '--editors',
    'lvce-editor,lvce-editor-minimal,monaco-editor,codemirror',
    '--iterations',
    '20',
    '--warmups',
    '1',
    '--output',
    'render-results',
    '--static',
    '.tmp/static',
  ])
})

test('disables render profiles from CI environment', () => {
  assert.equal(getCiRenderBenchmarkArgs({ PROFILE: 'false' }).at(-1), '--no-profile')
})
