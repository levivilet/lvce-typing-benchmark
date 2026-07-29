import assert from 'node:assert/strict'
import test from 'node:test'
import { parseStartupArgs } from '../src/startupCli.ts'

test('uses full startup benchmark defaults', () => {
  const options = parseStartupArgs([])
  assert.equal(options.iterations, 20)
  assert.equal(options.warmups, 1)
  assert.equal(options.profile, true)
  assert.deepEqual(options.ides, ['lvce-editor', 'vscode'])
})

test('parses startup benchmark overrides', () => {
  const options = parseStartupArgs([
    '--ides',
    'vscode',
    '--iterations',
    '5',
    '--warmups',
    '0',
    '--no-profile',
    '--headed',
  ])
  assert.deepEqual(options.ides, ['vscode'])
  assert.equal(options.iterations, 5)
  assert.equal(options.warmups, 0)
  assert.equal(options.profile, false)
  assert.equal(options.headed, true)
})

test('rejects unknown IDEs', () => {
  assert.throws(() => parseStartupArgs(['--ides', 'unknown']), /--ides must contain/)
})
