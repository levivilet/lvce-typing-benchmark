import type { IdeFixture, IdeId } from './types.ts'

export const ideIds: readonly IdeId[] = ['lvce-editor', 'vscode']

export const ideLabels: Readonly<Record<IdeId, string>> = {
  'lvce-editor': 'LVCE Editor',
  vscode: 'VS Code',
}

export const isIdeId = (value: string): value is IdeId => {
  return ideIds.includes(value as IdeId)
}

export const getIdeFixture = (fixtures: readonly IdeFixture[], id: IdeId): IdeFixture => {
  const fixture = fixtures.find((candidate) => candidate.id === id)
  if (!fixture) {
    throw new Error(`IDE fixture "${id}" is missing. Run npm run setup first.`)
  }
  return fixture
}
