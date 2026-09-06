import 'ace-builds'
import 'ace-builds/src-noconflict/mode-html.js'
import '../common.css'
import { renderDocument } from '../renderDocument.ts'
import { markReady } from '../types.ts'

declare global {
  interface Window {
    readonly ace: typeof import('ace-builds')
  }
}

const element = document.querySelector<HTMLElement>('#editor')
if (!element) {
  throw new Error('Editor container not found')
}

const renderMode = new URL(location.href).searchParams.has('render')
const editor = window.ace.edit(element)
editor.session.setUseWorker(false)
editor.session.setMode(renderMode ? 'ace/mode/html' : 'ace/mode/text')
editor.setValue(renderMode ? renderDocument : '', -1)

editor.renderer.once('afterRender', () => {
  markReady(
    {
      focus: () => editor.focus(),
      getText: () => editor.getValue(),
    },
    renderMode,
  )
})
