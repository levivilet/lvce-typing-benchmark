import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRenderArgs } from '../src/renderCli.ts'

test('uses full render benchmark defaults', () => {
  const options = parseRenderArgs([])
  assert.equal(options.iterations, 20)
  assert.equal(options.warmups, 1)
  assert.equal(options.profile, true)
  assert.deepEqual(options.editors, ['lvce-editor', 'monaco-editor', 'codemirror'])
})

test('parses render benchmark overrides', () => {
  const options = parseRenderArgs([
    '--editors',
    'monaco-editor,codemirror',
    '--iterations',
    '5',
    '--warmups',
    '0',
    '--no-profile',
    '--headed',
  ])
  assert.deepEqual(options.editors, ['monaco-editor', 'codemirror'])
  assert.equal(options.iterations, 5)
  assert.equal(options.warmups, 0)
  assert.equal(options.profile, false)
  assert.equal(options.headed, true)
})
