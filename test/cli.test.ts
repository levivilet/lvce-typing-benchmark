import assert from 'node:assert/strict'
import test from 'node:test'
import { parseArgs } from '../src/cli.ts'

test('uses the full benchmark defaults', () => {
  const options = parseArgs([])
  assert.equal(options.characters, 500)
  assert.equal(options.lagSamples, 100)
  assert.equal(options.iterations, 20)
  assert.equal(options.warmups, 1)
  assert.equal(options.profile, true)
  assert.deepEqual(options.editors, ['lvce-editor-minimal', 'lvce-editor-single-thread', 'monaco-editor', 'codemirror', 'codemirror5', 'codejar-prism', 'ace-editor'])
})

test('parses benchmark overrides', () => {
  const options = parseArgs([
    '--characters',
    '200',
    '--editors',
    'monaco-editor,codemirror,codemirror5,codejar-prism,ace-editor',
    '--iterations',
    '3',
    '--warmups',
    '0',
    '--no-profile',
  ])
  assert.equal(options.characters, 200)
  assert.equal(options.iterations, 3)
  assert.equal(options.warmups, 0)
  assert.equal(options.profile, false)
  assert.deepEqual(options.editors, ['monaco-editor', 'codemirror', 'codemirror5', 'codejar-prism', 'ace-editor'])
})

test('rejects unknown editors', () => {
  assert.throws(() => parseArgs(['--editors', 'unknown']), /--editors must contain/)
})

test('validates latency sample counts', () => {
  assert.equal(parseArgs(['--lag-samples', '7']).lagSamples, 7)
  for (const value of ['0', '-1', '1.5', 'NaN']) {
    assert.throws(() => parseArgs(['--lag-samples', value]), /must be an integer/)
  }
})
