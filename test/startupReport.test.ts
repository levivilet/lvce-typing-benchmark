import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writeStartupReport } from '../src/startupReport.ts'
import type { StartupBenchmarkSummary } from '../src/startupTypes.ts'

test('writes the IDE startup report, charts, and recordings', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'startup-report-'))
  const input = join(temporaryDirectory, 'input')
  const output = join(temporaryDirectory, 'output')
  await mkdir(join(input, 'videos'), { recursive: true })
  const stats = { mean: 100, min: 80, max: 120, p95: 120 }
  const summary: StartupBenchmarkSummary = {
    generatedAt: '2026-07-29T00:00:00.000Z',
    ides: [
      {
        domContentLoadedMs: stats,
        failures: 0,
        id: 'vscode',
        iterations: 20,
        javascriptDurationMs: stats,
        label: 'VS Code',
        startupDurationMs: stats,
        version: '1.108.2',
      },
    ],
  }
  await writeFile(join(input, 'summary.json'), JSON.stringify(summary))
  await writeFile(join(input, 'videos', 'vscode.webm'), 'test video')
  await writeStartupReport({ input, output, title: 'IDE Startup Results' })
  const html = await readFile(join(output, 'index.html'), 'utf8')
  const chart = await readFile(join(output, 'startup-duration.svg'), 'utf8')
  const video = await readFile(join(output, 'videos', 'vscode.webm'), 'utf8')
  assert.match(html, /IDE Startup Results/)
  assert.match(html, /GitHub1s/)
  assert.match(html, /Editor typing benchmark/)
  assert.match(html, /src="\.\/videos\/vscode\.webm"/)
  assert.match(chart, /VS Code/)
  assert.equal(video, 'test video')
})
