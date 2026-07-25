import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writeReport } from '../src/report.ts'
import type { BenchmarkSummary } from '../src/types.ts'

test('writes a static report and chart files', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'typing-report-'))
  const input = join(temporaryDirectory, 'input')
  const output = join(temporaryDirectory, 'output')
  await import('node:fs/promises').then(({ mkdir }) => mkdir(input))
  const stats = { mean: 10, min: 8, max: 12, p95: 12 }
  const summary: BenchmarkSummary = {
    generatedAt: '2026-07-25T00:00:00.000Z',
    characters: 500,
    editors: [
      {
        id: 'codemirror',
        label: 'CodeMirror',
        version: '6.0.2',
        iterations: 20,
        failures: 0,
        characters: 500,
        typingDurationMs: stats,
        javascriptDurationMs: stats,
      },
    ],
  }
  await writeFile(join(input, 'summary.json'), JSON.stringify(summary))
  await writeReport({ input, output, title: 'Typing Results' })
  const html = await readFile(join(output, 'index.html'), 'utf8')
  const chart = await readFile(join(output, 'typing-duration.svg'), 'utf8')
  assert.match(html, /Typing Results/)
  assert.match(html, /500/)
  assert.match(chart, /CodeMirror/)
})
