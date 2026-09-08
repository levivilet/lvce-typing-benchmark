import { pathToFileURL } from 'node:url'
import { editorIds } from './editors.ts'
import { runCli } from './main.ts'

const getBoolean = (value: string | undefined, fallback: boolean): boolean => {
  return value === undefined || value.trim() === '' ? fallback : value.trim() === 'true'
}

export const getCiBenchmarkArgs = (environment: NodeJS.ProcessEnv): readonly string[] => {
  const args = [
    '--lag-samples',
    environment.LAG_SAMPLES?.trim() || '100',
    '--characters',
    environment.CHARACTERS?.trim() || '500',
    '--editors',
    environment.EDITORS?.trim() || editorIds.join(','),
    '--iterations',
    environment.ITERATIONS?.trim() || '20',
    '--warmups',
    environment.WARMUPS?.trim() || '1',
    '--output',
    'results',
    '--static',
    '.tmp/static',
  ]
  if (!getBoolean(environment.PROFILE, true)) {
    args.push('--no-profile')
  }
  return args
}

export const runCiBenchmark = async (environment: NodeJS.ProcessEnv = process.env): Promise<void> => {
  await runCli(getCiBenchmarkArgs(environment))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCiBenchmark().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
