import CodeMirror from 'codemirror5'
import 'codemirror5/mode/xml/xml.js'
import 'codemirror5/mode/javascript/javascript.js'
import 'codemirror5/mode/css/css.js'
import 'codemirror5/mode/htmlmixed/htmlmixed.js'
import 'codemirror5/lib/codemirror.css'
import '../common.css'
import './style.css'
import { renderDocument } from '../renderDocument.ts'
import { markReady } from '../types.ts'

const element = document.querySelector<HTMLElement>('#editor')
if (!element) {
  throw new Error('Editor container not found')
}

const renderMode = new URL(location.href).searchParams.has('render')
const editor = CodeMirror(element, {
  lineNumbers: true,
  mode: renderMode ? 'htmlmixed' : 'text/plain',
  value: renderMode ? renderDocument : '',
})

markReady(
  {
    focus: () => editor.focus(),
    getText: () => editor.getValue(),
  },
  renderMode,
)
