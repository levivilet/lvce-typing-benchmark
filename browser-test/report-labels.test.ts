import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { chromium } from 'playwright'
import { editorIds, editorLabels } from '../src/editors.ts'
import { writeReport } from '../src/report.ts'
import { writeRenderReport } from '../src/renderReport.ts'

for (const rendering of [false, true]) {
  test(`${rendering ? 'rendering' : 'typing'} chart labels do not overlap with all seven editors`, async (context) => {
    const directory = await mkdtemp(join(tmpdir(), 'chart-labels-'))
    context.after(() => rm(directory, { recursive: true, force: true }))
    const stats = { mean: 9216.25, min: 9216, max: 9217, p95: 9217 }
    const memory = { mean: 126458265, min: 126458265, max: 126458265, p95: 126458265 }
    const editors = editorIds.map((id) => ({
      id,
      label: editorLabels[id],
      version: id === 'codejar-prism' ? '4.3.0 + Prism 1.30.0' : '19.59.0',
      iterations: 20,
      failures: 0,
      characters: 500,
      typingDurationMs: stats,
      typingLag: { samples: 100, requestedSamples: 100, failures: 0, durationMs: { ...stats, median: 9216.5 } },
      javascriptDurationMs: stats,
      domContentLoadedMs: stats,
      renderDurationMs: stats,
      paintEventCount: stats,
      paintDurationMs: stats,
      paintedAreaPixels: { mean: 921600, min: 921600, max: 921600, p95: 921600 },
      largestPaintAreaPixels: id === 'monaco-editor'
        ? { mean: 24576000, min: 24576000, max: 24576000, p95: 24576000 }
        : { mean: 921600, min: 921600, max: 921600, p95: 921600 },
      paintCommandCount: stats,
      layerCount: stats,
      contentLayerCount: stats,
      rendererProcessMemoryBytes: memory,
      gpuProcessMemoryBytes: memory,
      paintCommands: [],
    }))
    await writeFile(join(directory, 'summary.json'), JSON.stringify({
      generatedAt: '2026-09-06T00:00:00.000Z', characters: 500, document: 'index.html', lines: 100, editors,
    }))
    await writeFile(join(directory, 'cpu-breakdown.json'), JSON.stringify({ contexts: [], hotspots: [], iterations: 20, lvceJavaScriptMs: 10 }))
    await writeFile(join(directory, 'typing-lag.json'), '[]')
    await mkdir(join(directory, 'videos'))
    await Promise.all(editors.map(({ id }) => writeFile(join(directory, 'videos', `${id}.webm`), '')))
    const output = join(directory, 'output')
    await (rendering ? writeRenderReport : writeReport)({ input: directory, output, title: 'Results' })
    const chartFiles = (await readdir(output)).filter((file) => file.endsWith('.svg'))
    assert.equal(chartFiles.length, rendering ? 11 : 4)
    const browser = await chromium.launch()
    context.after(() => browser.close())
    const page = await browser.newPage()
    for (const file of chartFiles) {
      const svg = await readFile(join(output, file), 'utf8')
      for (const width of [360, 720, 1200, 1380]) {
        await page.setViewportSize({ width, height: 900 })
        await page.setContent(svg)
        assert.equal(await page.locator('.value').count(), editorIds.length * 2)
        const problems = await page.evaluate(() => {
          const svgElement = document.querySelector('svg')!
          const bounds = svgElement.getBoundingClientRect()
          const labels = [...document.querySelectorAll('text')]
          const issues: string[] = []
          for (const [index, label] of labels.entries()) {
            const a = label.getBoundingClientRect()
            if (a.left < bounds.left || a.right > bounds.right || a.top < bounds.top || a.bottom > bounds.bottom) {
              issues.push(`Clipped: ${label.textContent}`)
            }
            const remainingLabels = labels.slice(index + 1)
            for (const other of remainingLabels) {
              const b = other.getBoundingClientRect()
              if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
                issues.push(`Overlap: ${label.textContent} / ${other.textContent}`)
              }
            }
          }
          return issues
        })
        assert.deepEqual(problems, [], `${file} labels at ${width}px`)
      }
    }
  })
}
