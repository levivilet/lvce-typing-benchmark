import { CodeJar } from 'codejar'
import Prism from 'prismjs'
import 'prismjs/themes/prism.css'
import '../common.css'
import './style.css'
import { renderDocument } from '../renderDocument.ts'
import { markReady } from '../types.ts'

const element = document.querySelector<HTMLElement>('#editor')
if (!element) {
  throw new Error('Editor container not found')
}

const renderMode = new URL(location.href).searchParams.has('render')
Prism.manual = true
element.classList.add(renderMode ? 'language-html' : 'language-none')
const editor = CodeJar(element, (editorElement) => {
  if (renderMode) {
    Prism.highlightElement(editorElement)
  }
})
element.style.whiteSpace = 'pre'
if (renderMode) {
  editor.updateCode(renderDocument)
}

markReady(
  {
    focus: () => element.focus(),
    getText: () => editor.toString(),
  },
  renderMode,
)
