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
  await writeFile(
    join(input, 'cpu-breakdown.json'),
    JSON.stringify({
      contexts: [
        {
          functionCount: 2,
          kind: 'worker',
          name: 'Editor worker',
          selfMs: 7,
          share: 70,
        },
      ],
      hotspots: [
        {
          columnNumber: 2,
          context: 'Editor worker',
          functionName: 'updateDerivedState',
          inclusiveMs: 8,
          lineNumber: 10,
          samples: 4,
          selfMs: 7,
          share: 70,
          source: 'editorWorkerMain.js',
        },
      ],
      iterations: 20,
      lvceJavaScriptMs: 10,
    }),
  )
  await writeReport({ input, output, title: 'Typing Results' })
  const html = await readFile(join(output, 'index.html'), 'utf8')
  const breakdownHtml = await readFile(join(output, 'lvce-cpu', 'index.html'), 'utf8')
  const chart = await readFile(join(output, 'typing-duration.svg'), 'utf8')
  assert.match(html, /Typing Results/)
  assert.match(html, /500/)
  assert.match(html, /IDE startup benchmark/)
  assert.match(html, /LVCE Editor Only CPU breakdown/)
  assert.match(chart, /CodeMirror/)
  assert.match(breakdownHtml, /updateDerivedState/)
  assert.match(breakdownHtml, /Editor worker/)
  assert.match(breakdownHtml, /Self CPU per run/)
  assert.doesNotMatch(html, /Typing lag results/)
  const lag = { cadence: 'varied-16-65ms-v2', samples: 100, requestedSamples: 100, failures: 0, durationMs: { mean: 5, min: 1, median: 4, p95: 9, max: 15 } }
  await writeFile(join(input, 'summary.json'), JSON.stringify({ ...summary, editors: summary.editors.map((editor) => ({ ...editor, typingLag: lag })) }))
  await writeFile(join(input, 'typing-lag.json'), '[]')
  await writeReport({ input, output, title: 'Typing Results' })
  const lagHtml = await readFile(join(output, 'index.html'), 'utf8')
  assert.match(lagHtml, /Typing lag results/)
  assert.match(lagHtml, /16–65 ms varied/)
  assert.match(lagHtml, /not pure editor execution time/)
  assert.match(lagHtml, /100 \/ 100/)
  assert.match(lagHtml, /physical display latency/)
  assert.match(lagHtml, /4 ms/)
  const lagChart = await readFile(join(output, 'typing-lag.svg'), 'utf8')
  assert.match(lagChart, />Average</)
  assert.match(lagChart, />5</)
  const distribution = await readFile(join(output, 'typing-lag-distribution.svg'), 'utf8')
  assert.match(distribution, />Median</)
  assert.match(distribution, />p95</)
  assert.match(distribution, />4</)
  assert.match(distribution, />9</)
  assert.equal(await readFile(join(output, 'typing-lag.json'), 'utf8'), '[]')
})
