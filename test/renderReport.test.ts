import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writeRenderReport } from '../src/renderReport.ts'
import type { RenderBenchmarkSummary } from '../src/renderTypes.ts'

test('writes the syntax highlight report and requested charts', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'render-report-'))
  const input = join(temporaryDirectory, 'input')
  const output = join(temporaryDirectory, 'output')
  await mkdir(input)
  await mkdir(join(input, 'videos'))
  const milliseconds = { mean: 10, min: 8, max: 12, p95: 12 }
  const bytes = { mean: 20 * 1024 * 1024, min: 18 * 1024 * 1024, max: 22 * 1024 * 1024, p95: 22 * 1024 * 1024 }
  const summary: RenderBenchmarkSummary = {
    document: 'benchmark.html',
    generatedAt: '2026-07-26T00:00:00.000Z',
    lines: 34,
    editors: [
      {
        id: 'codemirror',
        label: 'CodeMirror',
        version: '6.0.2',
        iterations: 20,
        failures: 0,
        contentLayerAreaPixels: bytes,
        contentLayerCount: milliseconds,
        domContentLoadedMs: milliseconds,
        renderDurationMs: milliseconds,
        javascriptDurationMs: milliseconds,
        javascriptHeapUsedBytes: bytes,
        largestPaintAreaPixels: bytes,
        layerCount: milliseconds,
        paintCommandCount: milliseconds,
        paintDurationMs: milliseconds,
        paintedAreaPixels: bytes,
        paintEventCount: milliseconds,
        rendererProcessMemoryBytes: bytes,
        gpuProcessMemoryBytes: bytes,
      },
    ],
  }
  await writeFile(join(input, 'summary.json'), JSON.stringify(summary))
  await writeFile(join(input, 'videos', 'codemirror.webm'), 'test video')
  await writeRenderReport({ input, output, title: 'Render Results' })
  const html = await readFile(join(output, 'index.html'), 'utf8')
  const video = await readFile(join(output, 'videos', 'codemirror.webm'), 'utf8')
  const renderChart = await readFile(join(output, 'syntax-highlight-render.svg'), 'utf8')
  const gpuChart = await readFile(join(output, 'gpu-process-memory.svg'), 'utf8')
  const paintChart = await readFile(join(output, 'painted-area.svg'), 'utf8')
  const paintDurationChart = await readFile(join(output, 'paint-duration.svg'), 'utf8')
  const layerChart = await readFile(join(output, 'composited-layers.svg'), 'utf8')
  assert.match(html, /Render Results/)
  assert.match(html, /without a surrounding IDE workbench/)
  assert.match(html, /IDE startup benchmark/)
  assert.match(html, /Recorded loads/)
  assert.match(html, /src="\.\/videos\/codemirror\.webm"/)
  assert.ok(html.indexOf('Recorded loads') < html.indexOf('DOM content loaded'))
  assert.equal(video, 'test video')
  assert.match(renderChart, /CodeMirror/)
  assert.match(gpuChart, /GPU process memory/)
  assert.match(paintChart, /Cumulative painted area/)
  assert.match(paintDurationChart, /Paint time/)
  assert.match(layerChart, /Composited layers/)
  assert.match(html, /Painting details/)
  assert.match(html, /Paint Profiler snapshots/)
})
