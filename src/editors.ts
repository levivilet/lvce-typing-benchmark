import type { EditorFixture, EditorId } from './types.ts'

export const editorIds: readonly EditorId[] = ['lvce-editor-minimal', 'monaco-editor', 'codemirror']

export const editorLabels: Readonly<Record<EditorId, string>> = {
  'lvce-editor-minimal': 'LVCE Editor Only',
  'monaco-editor': 'Monaco Editor',
  codemirror: 'CodeMirror',
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
