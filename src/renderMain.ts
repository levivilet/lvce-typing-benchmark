import { pathToFileURL } from 'node:url'
import { parseRenderArgs } from './renderCli.ts'
import { runRenderBenchmark } from './renderBenchmark.ts'

export const runRenderCli = async (argv: readonly string[]): Promise<void> => {
  await runRenderBenchmark(parseRenderArgs(argv))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRenderCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
