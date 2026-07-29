import { pathToFileURL } from 'node:url'
import { runStartupBenchmark } from './startupBenchmark.ts'
import { parseStartupArgs } from './startupCli.ts'

export const runStartupCli = async (argv: readonly string[]): Promise<void> => {
  await runStartupBenchmark(parseStartupArgs(argv))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStartupCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
