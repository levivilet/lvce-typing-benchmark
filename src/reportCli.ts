import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeReport } from './report.ts'

export const runReportCli = async (argv: readonly string[]): Promise<void> => {
  let input = 'results'
  let output = '.tmp/pages'
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    const value = argv[index + 1]
    if ((argument === '--input' || argument === '--output') && !value) {
      throw new Error(`Missing value for ${argument}`)
    }
    if (argument === '--input') {
      input = value as string
      index++
    } else if (argument === '--output') {
      output = value as string
      index++
    } else {
      throw new Error(`Unknown argument ${argument}`)
    }
  }
  await writeReport({
    input: resolve(input),
    output: resolve(output),
    title: 'LVCE Typing Benchmark Results',
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReportCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
