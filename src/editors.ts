import type { EditorFixture, EditorId } from './types.ts'

export const editorIds: readonly EditorId[] = ['lvce-editor-minimal', 'lvce-editor-single-thread', 'monaco-editor', 'codemirror', 'ace-editor']

export const editorLabels: Readonly<Record<EditorId, string>> = {
  'lvce-editor-minimal': 'LVCE Editor Only',
  'lvce-editor-single-thread': 'LVCE Editor Single Thread',
  'monaco-editor': 'Monaco Editor',
  codemirror: 'CodeMirror',
  'ace-editor': 'Ace Editor',
}

export const isEditorId = (value: string): value is EditorId => {
  return editorIds.includes(value as EditorId)
}

export const getEditorFixture = (fixtures: readonly EditorFixture[], id: EditorId): EditorFixture => {
  const fixture = fixtures.find((candidate) => candidate.id === id)
  if (!fixture) {
    throw new Error(`Editor fixture "${id}" is missing. Run npm run setup first.`)
  }
  return fixture
}
