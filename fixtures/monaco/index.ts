import * as monaco from 'monaco-editor/editor/editor.api.js'
import '../common.css'
import { markReady } from '../types.ts'

const element = document.querySelector<HTMLElement>('#editor')
if (!element) {
  throw new Error('Editor container not found')
}

const editor = monaco.editor.create(element, {
  automaticLayout: true,
  language: 'plaintext',
  minimap: { enabled: false },
  value: '',
})

markReady({
  focus: () => editor.focus(),
  getText: () => editor.getValue(),
})
