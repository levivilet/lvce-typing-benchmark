import { resolve } from 'node:path'
import { editorIds, isEditorId } from './editors.ts'
import type { BenchmarkOptions, EditorId } from './types.ts'

const defaults: BenchmarkOptions = {
  characters: 500,
  lagSamples: 100,
  editors: editorIds,
  headed: false,
  iterations: 20,
  output: 'results',
  profile: true,
  staticDirectory: '.tmp/static',
  timeout: 60_000,
  warmups: 1,
}

const takeValue = (args: readonly string[], index: number, flag: string): string => {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`)
  }
  return value
}

const parseInteger = (value: string, flag: string, minimum: number): number => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || `${parsed}` !== value) {
    throw new Error(`${flag} must be an integer of at least ${minimum}`)
  }
  return parsed
}

const parseEditors = (value: string): readonly EditorId[] => {
  const editors = value
    .split(',')
    .map((editor) => editor.trim())
    .filter(Boolean)
  if (editors.length === 0 || editors.some((editor) => !isEditorId(editor))) {
    throw new Error(`--editors must contain: ${editorIds.join(', ')}`)
  }
  return editors as readonly EditorId[]
}

export const parseArgs = (argv: readonly string[]): BenchmarkOptions => {
  let options = { ...defaults }
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    switch (argument) {
      case '--characters':
        options = { ...options, characters: parseInteger(takeValue(argv, index, argument), argument, 1) }
        index++
        break
      case '--editors':
        options = { ...options, editors: parseEditors(takeValue(argv, index, argument)) }
        index++
        break
      case '--headed':
        options = { ...options, headed: true }
        break
      case '--iterations':
        options = { ...options, iterations: parseInteger(takeValue(argv, index, argument), argument, 1) }
        index++
        break
      case '--lag-samples':
        options = { ...options, lagSamples: parseInteger(takeValue(argv, index, argument), argument, 1) }
        index++
        break
      case '--no-profile':
        options = { ...options, profile: false }
        break
      case '--output':
        options = { ...options, output: resolve(takeValue(argv, index, argument)) }
        index++
        break
      case '--static':
        options = { ...options, staticDirectory: resolve(takeValue(argv, index, argument)) }
        index++
        break
      case '--timeout':
        options = { ...options, timeout: parseInteger(takeValue(argv, index, argument), argument, 1) }
        index++
        break
      case '--warmups':
        options = { ...options, warmups: parseInteger(takeValue(argv, index, argument), argument, 0) }
        index++
        break
      case '--help':
      case '-h':
        throw new Error(getHelpText())
      default:
        throw new Error(`Unknown argument ${argument}`)
    }
  }
  return options
}

export const getHelpText = (): string => `Usage: npm run benchmark -- [options]

Options:
  --lag-samples <n>   Sequential typing-lag samples per editor (default: 100)
  --characters <n>    Characters typed per iteration (default: 500)
  --editors <csv>     Editors to benchmark (default: all)
  --iterations <n>    Measured iterations per editor (default: 20)
  --warmups <n>       Warmup iterations per editor (default: 1)
  --timeout <ms>      Per-step timeout (default: 60000)
  --output <path>     Results directory (default: results)
  --static <path>     Generated fixtures directory (default: .tmp/static)
  --no-profile        Do not record Chromium CPU profiles
  --headed            Run Chromium headed
`
