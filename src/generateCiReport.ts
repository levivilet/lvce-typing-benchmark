import { access, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeRenderReport } from './renderReport.ts'
import { writeReport } from './report.ts'
import { writeStartupReport } from './startupReport.ts'

export const generateCiReport = async (environment: NodeJS.ProcessEnv = process.env): Promise<boolean> => {
  const input = 'results'
  const output = '.tmp/pages'
  let hasResults = true
  try {
    await access(join(input, 'summary.json'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    hasResults = false
  }
  if (hasResults) {
    await writeReport({ input, output, title: 'LVCE Typing Benchmark Results' })
  }
  let hasRenderResults = true
  try {
    await access(join('render-results', 'summary.json'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    hasRenderResults = false
  }
  if (hasRenderResults) {
    await writeRenderReport({
      input: 'render-results',
      output: join(output, 'rendering'),
      title: 'Syntax Highlight Rendering Benchmark',
    })
  }
  let hasStartupResults = true
  try {
    await access(join('startup-results', 'summary.json'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    hasStartupResults = false
  }
  if (hasStartupResults) {
    await writeStartupReport({
      input: 'startup-results',
      output: join(output, 'ide-startup'),
      title: 'IDE Startup Benchmark',
    })
  }
  const hasPages = hasResults || hasRenderResults || hasStartupResults
  if (environment.GITHUB_OUTPUT) {
    await appendFile(environment.GITHUB_OUTPUT, `pages=${hasPages}\n`)
  }
  return hasPages
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateCiReport().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
