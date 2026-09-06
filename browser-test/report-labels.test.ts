import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    const stats = { mean: 10, min: 8, max: 12, p95: 12 }
    const editors = editorIds.map((id) => ({
      id,
      label: editorLabels[id],
      version: id === 'codejar-prism' ? '4.3.0 + Prism 1.30.0' : '19.59.0',
      iterations: 20,
      failures: 0,
      characters: 500,
      typingDurationMs: stats,
      javascriptDurationMs: stats,
      domContentLoadedMs: stats,
      renderDurationMs: stats,
      paintEventCount: stats,
      paintDurationMs: stats,
      paintedAreaPixels: stats,
      largestPaintAreaPixels: stats,
      paintCommandCount: stats,
      layerCount: stats,
      contentLayerCount: stats,
      rendererProcessMemoryBytes: stats,
      gpuProcessMemoryBytes: stats,
      paintCommands: [],
    }))
    await writeFile(join(directory, 'summary.json'), JSON.stringify({
      generatedAt: '2026-09-06T00:00:00.000Z', characters: 500, document: 'index.html', lines: 100, editors,
    }))
    await writeFile(join(directory, 'cpu-breakdown.json'), JSON.stringify({ contexts: [], hotspots: [], iterations: 20, lvceJavaScriptMs: 10 }))
    await mkdir(join(directory, 'videos'))
    await Promise.all(editors.map(({ id }) => writeFile(join(directory, 'videos', `${id}.webm`), '')))
    const output = join(directory, 'output')
    await (rendering ? writeRenderReport : writeReport)({ input: directory, output, title: 'Results' })
    const svg = await readFile(join(output, 'javascript-duration.svg'), 'utf8')
    const browser = await chromium.launch()
    context.after(() => browser.close())
    const page = await browser.newPage()
    for (const width of [720, 1200, 1380]) {
      await page.setViewportSize({ width, height: 900 })
      await page.setContent(svg)
      const problems = await page.evaluate(() => {
        const svgElement = document.querySelector('svg')!
        const bounds = svgElement.getBoundingClientRect()
        const labels = [...document.querySelectorAll('.editor-label, .version-label')]
        const issues: string[] = []
        for (const [index, label] of labels.entries()) {
          const a = label.getBoundingClientRect()
          if (a.left < bounds.left || a.right > bounds.right || a.bottom > bounds.bottom) {
            issues.push(`Clipped: ${label.textContent}`)
          }
          for (const other of labels.slice(index + 1)) {
            const b = other.getBoundingClientRect()
            if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
              issues.push(`Overlap: ${label.textContent} / ${other.textContent}`)
            }
          }
        }
        return issues
      })
      assert.deepEqual(problems, [], `Labels at ${width}px`)
    }
  })
}
