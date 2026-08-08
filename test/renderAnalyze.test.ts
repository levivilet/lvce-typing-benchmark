import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { analyzeRenderResults } from '../src/renderAnalyze.ts'
import type { PaintCommandCount, RenderBenchmarkMetadata, RenderIterationResult } from '../src/renderTypes.ts'

const createIteration = (
  iteration: number,
  paintCommandCount: number,
  paintCommands: readonly PaintCommandCount[],
): RenderIterationResult => ({
  contentLayerCount: 2,
  domContentLoadedMs: 10,
  editor: 'codemirror',
  gpuProcessMemoryBytes: 20,
  iteration,
  javascriptHeapUsedBytes: 20,
  largestPaintAreaPixels: 20,
  layerCount: 5,
  paintCommandCount,
  paintCommands,
  paintDurationMs: 2,
  paintedAreaPixels: 20,
  paintEventCount: 3,
  rendererProcessMemoryBytes: 20,
  renderDurationMs: 10,
  success: true,
  warmup: false,
})

test('summarizes paint command methods across measured loads', async () => {
  const input = await mkdtemp(join(tmpdir(), 'render-analyze-'))
  const metadata: RenderBenchmarkMetadata = {
    document: 'benchmark.html',
    editors: [
      {
        id: 'codemirror',
        kind: 'static',
        label: 'CodeMirror',
        path: '/codemirror/',
        version: '6.0.2',
      },
    ],
    lines: 34,
  }
  const iterations: readonly RenderIterationResult[] = [
    createIteration(1, 5, [
      { count: 4, method: 'drawTextBlob' },
      { count: 1, method: 'drawRect' },
    ]),
    createIteration(2, 6, [{ count: 6, method: 'drawTextBlob' }]),
  ]
  await writeFile(join(input, 'benchmark.json'), JSON.stringify(metadata))
  await writeFile(join(input, 'iterations.json'), JSON.stringify(iterations))

  const summary = await analyzeRenderResults(input)

  const editor = summary.editors[0]
  assert.ok(editor)
  assert.deepEqual(editor.paintCommands, [
    { count: { mean: 5, min: 4, max: 6, p95: 6 }, method: 'drawTextBlob' },
    { count: { mean: 0.5, min: 0, max: 1, p95: 1 }, method: 'drawRect' },
  ])
  const writtenSummary = JSON.parse(await readFile(join(input, 'summary.json'), 'utf8'))
  assert.deepEqual(writtenSummary.editors[0].paintCommands, editor.paintCommands)
})
