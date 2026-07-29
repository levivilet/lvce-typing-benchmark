import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeStartupReport } from './startupReport.ts'

const parseArgs = (argv: readonly string[]): { readonly input: string; readonly output: string } => {
  let input = 'startup-results'
  let output = '.tmp/pages/ide-startup'
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    const value = argv[index + 1]
    if ((argument === '--input' || argument === '--output') && value) {
      if (argument === '--input') {
        input = value
      } else {
        output = value
      }
      index++
      continue
    }
    throw new Error(`Unknown or incomplete argument ${argument}`)
  }
  return { input: resolve(input), output: resolve(output) }
}

const run = async (): Promise<void> => {
  const { input, output } = parseArgs(process.argv.slice(2))
  await writeStartupReport({ input, output, title: 'IDE Startup Benchmark' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
