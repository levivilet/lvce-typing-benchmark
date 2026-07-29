import { pathToFileURL } from 'node:url'
import { runStartupCli } from './startupMain.ts'

const getBoolean = (value: string | undefined, fallback: boolean): boolean => {
  return value === undefined || value.trim() === '' ? fallback : value.trim() === 'true'
}

export const getCiStartupBenchmarkArgs = (environment: NodeJS.ProcessEnv): readonly string[] => {
  const args = [
    '--ides',
    environment.IDES?.trim() || 'lvce-editor,vscode',
    '--iterations',
    environment.ITERATIONS?.trim() || '20',
    '--warmups',
    environment.WARMUPS?.trim() || '1',
    '--output',
    'startup-results',
    '--static',
    '.tmp/static',
  ]
  if (!getBoolean(environment.PROFILE, true)) {
    args.push('--no-profile')
  }
  return args
}

export const runCiStartupBenchmark = async (environment: NodeJS.ProcessEnv = process.env): Promise<void> => {
  await runStartupCli(getCiStartupBenchmarkArgs(environment))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCiStartupBenchmark().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
