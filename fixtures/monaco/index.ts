import * as monaco from 'monaco-editor/editor/editor.api.js'
import '../common.css'
import { renderDocument } from '../renderDocument.ts'
import { markReady } from '../types.ts'

const element = document.querySelector<HTMLElement>('#editor')
if (!element) {
  throw new Error('Editor container not found')
}

const renderMode = new URL(location.href).searchParams.has('render')

const editor = monaco.editor.create(element, {
  automaticLayout: true,
  language: renderMode ? 'html' : 'plaintext',
  minimap: { enabled: false },
  value: renderMode ? renderDocument : '',
})

markReady(
  {
    focus: () => editor.focus(),
    getText: () => editor.getValue(),
  },
  renderMode,
)
