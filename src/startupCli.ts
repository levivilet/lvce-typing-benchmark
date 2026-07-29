import { resolve } from 'node:path'
import { ideIds, isIdeId } from './ides.ts'
import type { StartupBenchmarkOptions } from './startupTypes.ts'
import type { IdeId } from './types.ts'

const defaults: StartupBenchmarkOptions = {
  headed: false,
  ides: ideIds,
  iterations: 20,
  output: 'startup-results',
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

const parseIdes = (value: string): readonly IdeId[] => {
  const ides = value
    .split(',')
    .map((ide) => ide.trim())
    .filter(Boolean)
  if (ides.length === 0 || ides.some((ide) => !isIdeId(ide))) {
    throw new Error(`--ides must contain: ${ideIds.join(', ')}`)
  }
  return ides as readonly IdeId[]
}

export const parseStartupArgs = (argv: readonly string[]): StartupBenchmarkOptions => {
  let options = { ...defaults }
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    switch (argument) {
      case '--headed':
        options = { ...options, headed: true }
        break
      case '--ides':
        options = { ...options, ides: parseIdes(takeValue(argv, index, argument)) }
        index++
        break
      case '--iterations':
        options = { ...options, iterations: parseInteger(takeValue(argv, index, argument), argument, 1) }
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
        throw new Error(getStartupHelpText())
      default:
        throw new Error(`Unknown argument ${argument}`)
    }
  }
  return options
}

export const getStartupHelpText = (): string => `Usage: npm run benchmark:startup -- [options]

Options:
  --ides <csv>        IDEs to benchmark (default: all)
  --iterations <n>    Measured iterations per IDE (default: 20)
  --warmups <n>       Warmup iterations per IDE (default: 1)
  --timeout <ms>      Per-step timeout (default: 60000)
  --output <path>     Results directory (default: startup-results)
  --static <path>     Generated fixtures directory (default: .tmp/static)
  --no-profile        Do not record Chromium CPU profiles
  --headed            Run Chromium headed
`
