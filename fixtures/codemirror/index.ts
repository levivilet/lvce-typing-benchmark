import { basicSetup, EditorView } from 'codemirror'
import { html } from '@codemirror/lang-html'
import '../common.css'
import { renderDocument } from '../renderDocument.ts'
import { markReady } from '../types.ts'

const element = document.querySelector<HTMLElement>('#editor')
if (!element) {
  throw new Error('Editor container not found')
}

const renderMode = new URL(location.href).searchParams.has('render')

const editor = new EditorView({
  doc: renderMode ? renderDocument : '',
  extensions: [
    basicSetup,
    ...(renderMode ? [html()] : []),
    EditorView.theme({
      '&': { height: '100%' },
      '.cm-scroller': { overflow: 'auto' },
    }),
  ],
  parent: element,
})

markReady(
  {
    focus: () => editor.focus(),
    getText: () => editor.state.doc.toString(),
  },
  renderMode,
)
