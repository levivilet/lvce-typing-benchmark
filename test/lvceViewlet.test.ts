import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import * as EditorOnlyViewlet from '../fixtures/lvce/viewlet.ts'

beforeEach(() => {
  const { window } = new JSDOM()
  Object.assign(globalThis, { document: window.document, HTMLElement: window.HTMLElement })
})

test('creates only the editor root and applies its bounds', () => {
  EditorOnlyViewlet.create(701)
  EditorOnlyViewlet.executeCommands([
    ['Viewlet.setBounds', 701, 0, 0, 800, 600],
    ['Viewlet.setFocusContext', 701, 12],
  ])

  assert.equal(document.body.children.length, 1)
  const element = document.body.firstElementChild as HTMLElement
  assert.equal(element.style.width, '800px')
  assert.equal(element.style.height, '600px')
})

test('rejects workbench render commands', () => {
  assert.throws(() => EditorOnlyViewlet.executeCommands([['Viewlet.createPlaceholder', 'ActivityBar']]), {
    message: 'Unsupported editor-only render command: Viewlet.createPlaceholder',
  })
})

test('supports selector scrolling commands', () => {
  const scrollIntoView = mock.fn()
  EditorOnlyViewlet.create(702)
  const root = document.body.firstElementChild as HTMLElement
  const tabs = document.createElement('div')
  tabs.className = 'Tabs'
  tabs.scrollLeft = 20
  Object.defineProperty(tabs, 'scrollIntoView', { value: scrollIntoView })
  root.append(tabs)

  EditorOnlyViewlet.executeCommands([
    ['Viewlet.scrollSelectorBy', 702, '.Tabs', 30],
    ['Viewlet.scrollSelectorIntoView', 702, '.Tabs'],
  ])

  assert.equal(tabs.scrollLeft, 50)
  assert.deepEqual(scrollIntoView.mock.calls[0]?.arguments, [{ block: 'nearest', inline: 'nearest' }])
})
