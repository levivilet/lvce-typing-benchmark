import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { analyzeResults } from './analyze.ts'
import type { BenchmarkMetadata } from './types.ts'

export const runAnalyzeCli = async (argv: readonly string[]): Promise<void> => {
  const input = resolve(argv[0] || 'results')
  const metadata = JSON.parse(await readFile(`${input}/benchmark.json`, 'utf8')) as BenchmarkMetadata
  await analyzeResults(input, metadata.editors, metadata.characters)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAnalyzeCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
