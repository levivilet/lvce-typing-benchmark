import assert from 'node:assert/strict'
import test from 'node:test'
import { getCiStartupBenchmarkArgs } from '../src/runCiStartupBenchmark.ts'

test('builds full startup benchmark CI arguments by default', () => {
  assert.deepEqual(getCiStartupBenchmarkArgs({}), [
    '--ides',
    'lvce-editor,vscode',
    '--iterations',
    '20',
    '--warmups',
    '1',
    '--output',
    'startup-results',
    '--static',
    '.tmp/static',
  ])
})

test('disables startup profiles from CI environment', () => {
  assert.equal(getCiStartupBenchmarkArgs({ PROFILE: 'false' }).at(-1), '--no-profile')
})
