import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { getEditorOnlyConfig } from '../fixtures/lvce/config.ts'

beforeEach(() => {
  const { window } = new JSDOM()
  Object.assign(globalThis, { document: window.document, HTMLElement: window.HTMLElement })
})

test('returns the standalone editor configuration', () => {
  const config = document.createElement('script')
  config.id = 'Config'
  config.type = 'application/json'
  config.textContent = JSON.stringify({
    editorOnly: {
      content: '<h1>Hello</h1>',
      languageId: 'html',
    },
  })
  document.body.append(config)

  assert.deepEqual(getEditorOnlyConfig(), {
    content: '<h1>Hello</h1>',
    languageId: 'html',
  })
})

test('returns an empty configuration when no config exists', () => {
  assert.deepEqual(getEditorOnlyConfig(), {})
})
