import assert from 'node:assert/strict'
import test from 'node:test'
import { getCiBenchmarkArgs } from '../src/runCiBenchmark.ts'

test('builds full CI benchmark arguments by default', () => {
  assert.deepEqual(getCiBenchmarkArgs({}), [
    '--characters',
    '500',
    '--editors',
    'lvce-editor-minimal,monaco-editor,codemirror',
    '--iterations',
    '20',
    '--warmups',
    '1',
    '--output',
    'results',
    '--static',
    '.tmp/static',
  ])
})

test('can disable profiles for a CI smoke run', () => {
  assert.ok(getCiBenchmarkArgs({ PROFILE: 'false' }).includes('--no-profile'))
})
