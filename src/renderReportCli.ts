import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeRenderReport } from './renderReport.ts'

export const runRenderReportCli = async (argv: readonly string[]): Promise<void> => {
  let input = 'render-results'
  let output = '.tmp/pages/rendering'
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
  await writeRenderReport({
    input: resolve(input),
    output: resolve(output),
    title: 'Syntax Highlight Rendering Benchmark',
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRenderReportCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
