import { pathToFileURL } from 'node:url'
import { editorIds } from './editors.ts'
import { runRenderCli } from './renderMain.ts'

const getBoolean = (value: string | undefined, fallback: boolean): boolean => {
  return value === undefined || value.trim() === '' ? fallback : value.trim() === 'true'
}

export const getCiRenderBenchmarkArgs = (environment: NodeJS.ProcessEnv): readonly string[] => {
  const args = [
    '--editors',
    environment.EDITORS?.trim() || editorIds.join(','),
    '--iterations',
    environment.ITERATIONS?.trim() || '20',
    '--warmups',
    environment.WARMUPS?.trim() || '1',
    '--output',
    'render-results',
    '--static',
    '.tmp/static',
  ]
  if (!getBoolean(environment.PROFILE, true)) {
    args.push('--no-profile')
  }
  return args
}

export const runCiRenderBenchmark = async (environment: NodeJS.ProcessEnv = process.env): Promise<void> => {
  await runRenderCli(getCiRenderBenchmarkArgs(environment))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCiRenderBenchmark().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
