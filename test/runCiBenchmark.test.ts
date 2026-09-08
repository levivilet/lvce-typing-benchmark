import assert from 'node:assert/strict'
import test from 'node:test'
import { getCiBenchmarkArgs } from '../src/runCiBenchmark.ts'

test('builds full CI benchmark arguments by default', () => {
  assert.deepEqual(getCiBenchmarkArgs({}), [
    '--lag-samples',
    '100',
    '--characters',
    '500',
    '--editors',
    'lvce-editor-minimal,lvce-editor-single-thread,monaco-editor,codemirror,codemirror5,codejar-prism,ace-editor',
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

test('supports a configured latency sample count in CI', () => {
  assert.deepEqual(getCiBenchmarkArgs({ LAG_SAMPLES: ' 25 ' }).slice(0, 2), ['--lag-samples', '25'])
})
