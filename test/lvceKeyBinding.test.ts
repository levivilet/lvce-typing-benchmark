import assert from 'node:assert/strict'
import test from 'node:test'
import { getEditorCommand } from '../fixtures/lvce/keyBinding.ts'

const event = (key: string, options: Partial<KeyboardEvent> = {}): KeyboardEvent => {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...options,
  } as KeyboardEvent
}

test('maps cursor movement directly to editor worker commands', () => {
  assert.equal(getEditorCommand(event('ArrowLeft')), 'cursorLeft')
  assert.equal(getEditorCommand(event('ArrowRight', { ctrlKey: true })), 'cursorWordRight')
  assert.equal(getEditorCommand(event('ArrowDown', { shiftKey: true })), 'selectDown')
  assert.equal(getEditorCommand(event('Home')), 'cursorHome')
})

test('maps editing shortcuts directly to editor worker commands', () => {
  assert.equal(getEditorCommand(event('a', { ctrlKey: true })), 'selectAll')
  assert.equal(getEditorCommand(event('z', { ctrlKey: true })), 'undo')
  assert.equal(getEditorCommand(event('z', { ctrlKey: true, shiftKey: true })), 'redo')
  assert.equal(getEditorCommand(event('Tab')), 'handleTab')
  assert.equal(getEditorCommand(event('Backspace')), 'deleteLeft')
  assert.equal(getEditorCommand(event('Delete', { ctrlKey: true })), 'deleteWordRight')
})

test('ignores text input handled by beforeinput', () => {
  assert.equal(getEditorCommand(event('a')), '')
})
