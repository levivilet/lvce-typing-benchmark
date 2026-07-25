import { pathToFileURL } from 'node:url'
import { runBenchmark } from './benchmark.ts'
import { parseArgs } from './cli.ts'

export const runCli = async (argv: readonly string[]): Promise<void> => {
  await runBenchmark(parseArgs(argv))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
