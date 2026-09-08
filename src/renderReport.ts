import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { wrapChartLabel } from './chartLabels.ts'
import type { RenderBenchmarkSummary, RenderEditorSummary } from './renderTypes.ts'
import type { Stats } from './types.ts'

interface RenderReportOptions {
  readonly input: string
  readonly output: string
  readonly title: string
}

interface ChartDefinition {
  readonly description: string
  readonly fileName: string
  readonly getStats: (summary: RenderEditorSummary) => Stats
  readonly title: string
  readonly unit: 'area' | 'bytes' | 'count' | 'ms'
}

const charts: readonly ChartDefinition[] = [
  {
    description: 'Navigation start to the DOMContentLoaded event.',
    fileName: 'dom-content-loaded.svg',
    getStats: (summary) => summary.domContentLoadedMs,
    title: 'DOM content loaded',
    unit: 'ms',
  },
  {
    description: 'Navigation start through syntax tokenization and two completed animation frames.',
    fileName: 'syntax-highlight-render.svg',
    getStats: (summary) => summary.renderDurationMs,
    title: 'Syntax-highlighted text rendered',
    unit: 'ms',
  },
  {
    description: 'Number of main-frame Chromium Paint trace events after navigation committed.',
    fileName: 'paint-events.svg',
    getStats: (summary) => summary.paintEventCount,
    title: 'Paint events',
    unit: 'count',
  },
  {
    description: 'Total main-thread time in Chromium Paint trace events after navigation committed.',
    fileName: 'paint-duration.svg',
    getStats: (summary) => summary.paintDurationMs,
    title: 'Paint time',
    unit: 'ms',
  },
  {
    description: 'Sum of all Paint trace clip areas. Overlapping and repainted pixels count once per paint event.',
    fileName: 'painted-area.svg',
    getStats: (summary) => summary.paintedAreaPixels,
    title: 'Cumulative painted area',
    unit: 'area',
  },
  {
    description: 'Area of the largest single paint damage rectangle observed during the load.',
    fileName: 'largest-paint.svg',
    getStats: (summary) => summary.largestPaintAreaPixels,
    title: 'Largest paint rectangle',
    unit: 'area',
  },
  {
    description: 'Display-list commands in available DevTools Paint Profiler snapshots of final content-bearing layers.',
    fileName: 'paint-commands.svg',
    getStats: (summary) => summary.paintCommandCount,
    title: 'Paint commands',
    unit: 'count',
  },
  {
    description: 'Composited layers in Chromium\'s final layer tree after syntax highlighting is ready.',
    fileName: 'composited-layers.svg',
    getStats: (summary) => summary.layerCount,
    title: 'Composited layers',
    unit: 'count',
  },
  {
    description: 'Resident memory used by Chromium renderer processes after the highlighted document is painted.',
    fileName: 'renderer-memory.svg',
    getStats: (summary) => summary.rendererProcessMemoryBytes,
    title: 'Renderer process memory',
    unit: 'bytes',
  },
  {
    description: 'Total sampled JavaScript CPU time across the page and its workers until the highlighted document is painted.',
    fileName: 'javascript-duration.svg',
    getStats: (summary) => summary.javascriptDurationMs,
    title: 'JavaScript execution',
    unit: 'ms',
  },
  {
    description: 'Resident memory used by the Chromium GPU process after the highlighted document is painted.',
    fileName: 'gpu-process-memory.svg',
    getStats: (summary) => summary.gpuProcessMemoryBytes,
    title: 'GPU process memory',
    unit: 'bytes',
  },
]

const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const formatNumber = (value: number | null, maximumFractionDigits = 2): string => {
  return value === null ? 'n/a' : new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value)
}

const formatBytes = (value: number | null): string => {
  if (value === null) {
    return 'n/a'
  }
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let scaled = value
  let unitIndex = 0
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024
    unitIndex++
  }
  return `${formatNumber(scaled, scaled >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

const formatArea = (value: number | null): string => {
  if (value === null) {
    return 'n/a'
  }
  const units = ['px²', 'Kpx²', 'Mpx²', 'Gpx²']
  let scaled = value
  let unitIndex = 0
  while (scaled >= 1_000 && unitIndex < units.length - 1) {
    scaled /= 1_000
    unitIndex++
  }
  return `${formatNumber(scaled, scaled >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

const formatValue = (value: number | null, unit: ChartDefinition['unit']): string => {
  if (unit === 'area') {
    return formatArea(value)
  }
  if (unit === 'bytes') {
    return formatBytes(value)
  }
  if (value === null) {
    return 'n/a'
  }
  return unit === 'ms' ? `${formatNumber(value)} ms` : formatNumber(value)
}

const renderChart = (summary: RenderBenchmarkSummary, chart: ChartDefinition): string => {
  const width = 1_200
  const left = 136
  const right = 30
  const top = 62
  const chartWidth = width - left - right
  const groupWidth = chartWidth / Math.max(1, summary.editors.length)
  const labels = summary.editors.map((editor) => ({
    name: wrapChartLabel(editor.label, groupWidth, 9),
    version: wrapChartLabel(`v${editor.version}`, groupWidth, 8),
  }))
  const labelRows = Math.max(2, ...labels.map((label) => label.name.length + label.version.length))
  const bottom = 52 + labelRows * 22
  const chartHeight = 302
  const height = top + chartHeight + bottom
  const values = summary.editors.flatMap((editor) => {
    const stats = chart.getStats(editor)
    return [stats.mean, stats.min].filter((value): value is number => value !== null)
  })
  const max = Math.max(1, ...values) * 1.12
  const toY = (value: number): number => top + chartHeight - (value / max) * chartHeight
  const barWidth = Math.min(72, groupWidth * 0.28)
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = (max * index) / 4
    const y = toY(value)
    return `<line class="grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" />
<text class="axis-label" x="${left - 14}" y="${y + 5}" text-anchor="end">${escapeHtml(formatValue(value, chart.unit))}</text>`
  }).join('\n')
  const groups = summary.editors
    .map((editor, index) => {
      const stats = chart.getStats(editor)
      const center = left + groupWidth * (index + 0.5)
      const bars = [
        { value: stats.mean, className: 'average', x: center - barWidth - 4 },
        { value: stats.min, className: 'fastest', x: center + 4 },
      ]
        .map(({ value, className, x }) => {
          if (value === null) {
            return ''
          }
          const y = toY(value)
          const barHeight = top + chartHeight - y
          // Separate nearby values vertically so labels wider than their bars remain readable.
          const labelY = className === 'average' && stats.min !== null
            ? Math.min(y - 8, toY(stats.min) - 30)
            : y - 8
          return `<rect class="${className}" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" />
<text class="value" x="${x + barWidth / 2}" y="${labelY}" text-anchor="middle">${escapeHtml(formatValue(value, chart.unit))}</text>`
        })
        .join('\n')
      const label = labels[index]!
      const renderLines = (lines: readonly string[], row: number): string => lines
        .map((line, lineIndex) => `<tspan x="${center}" y="${height - bottom + 30 + (row + lineIndex) * 22}">${escapeHtml(line)}</tspan>`)
        .join(' ')
      return `${bars}
<text class="editor-label" text-anchor="middle">${renderLines(label.name, 0)}</text>
<text class="version-label" text-anchor="middle">${renderLines(label.version, label.name.length)}</text>`
    })
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeHtml(chart.title)}</title>
  <desc id="description">${escapeHtml(chart.description)}</desc>
  <style>
    text { font-family: Inter, ui-sans-serif, system-ui, sans-serif; fill: #334155; }
    .grid { stroke: #dbe3ef; stroke-width: 1; }
    .axis-label, .version-label { font-size: 14px; }
    .editor-label { font-size: 17px; font-weight: 650; fill: #0f172a; }
    .value { font-size: 13px; font-weight: 650; fill: #0f172a; }
    .average { fill: #7c3aed; }
    .fastest { fill: #ea580c; }
  </style>
  <rect width="${width}" height="${height}" fill="#ffffff" />
  ${grid}
  <line x1="${left}" y1="${top + chartHeight}" x2="${width - right}" y2="${top + chartHeight}" stroke="#94a3b8" />
  ${groups}
  <circle cx="${width - 255}" cy="25" r="7" fill="#7c3aed" />
  <text x="${width - 240}" y="30" font-size="15">Average</text>
  <circle cx="${width - 145}" cy="25" r="7" fill="#ea580c" />
  <text x="${width - 130}" y="30" font-size="15">Fastest</text>
</svg>`
}

const renderRows = (summary: RenderBenchmarkSummary): string => {
  return summary.editors
    .map(
      (editor) => `<tr>
  <th scope="row">${escapeHtml(editor.label)} <span>v${escapeHtml(editor.version)}</span></th>
  <td>${editor.iterations}</td>
  <td>${editor.failures}</td>
  <td>${formatValue(editor.domContentLoadedMs.mean, 'ms')}</td>
  <td>${formatValue(editor.renderDurationMs.mean, 'ms')}</td>
  <td>${formatValue(editor.javascriptDurationMs.mean, 'ms')}</td>
  <td>${formatValue(editor.rendererProcessMemoryBytes.mean, 'bytes')}</td>
  <td>${formatValue(editor.gpuProcessMemoryBytes.mean, 'bytes')}</td>
</tr>`,
    )
    .join('\n')
}

const renderPaintRows = (summary: RenderBenchmarkSummary): string => {
  return summary.editors
    .map(
      (editor) => `<tr>
  <th scope="row">${escapeHtml(editor.label)} <span>v${escapeHtml(editor.version)}</span></th>
  <td>${formatValue(editor.paintEventCount.mean, 'count')}</td>
  <td>${formatValue(editor.paintDurationMs.mean, 'ms')}</td>
  <td>${formatValue(editor.paintedAreaPixels.mean, 'area')}</td>
  <td>${formatValue(editor.largestPaintAreaPixels.mean, 'area')}</td>
  <td>${formatValue(editor.paintCommandCount.mean, 'count')}</td>
  <td>${formatValue(editor.layerCount.mean, 'count')}</td>
  <td>${formatValue(editor.contentLayerCount.mean, 'count')}</td>
</tr>`,
    )
    .join('\n')
}

const renderPaintCommandBreakdown = (summary: RenderBenchmarkSummary): string => {
  return summary.editors
    .map((editor) => {
      const rows = editor.paintCommands
        .map(
          (command) => `<tr>
  <th scope="row"><code>${escapeHtml(command.method)}</code></th>
  <td>${formatValue(command.count.mean, 'count')}</td>
  <td>${formatValue(command.count.min, 'count')}</td>
  <td>${formatValue(command.count.max, 'count')}</td>
</tr>`,
        )
        .join('\n')
      return `<article class="paint-command-card">
        <h3>${escapeHtml(editor.label)} <span>v${escapeHtml(editor.version)}</span></h3>
        <p>${formatValue(editor.paintCommandCount.mean, 'count')} commands per load · ${editor.paintCommands.length} command types</p>
        <table>
          <thead><tr><th>Command method</th><th>Average</th><th>Minimum</th><th>Maximum</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </article>`
    })
    .join('\n')
}

const renderLoadVideos = (summary: RenderBenchmarkSummary): string => {
  return summary.editors
    .map(
      (editor) => `<article class="card video-card">
      <h3>${escapeHtml(editor.label)}</h3>
      <p class="video-version">v${escapeHtml(editor.version)}</p>
      <video controls muted playsinline preload="metadata" src="./videos/${escapeHtml(editor.id)}.webm" aria-label="${escapeHtml(editor.label)} load recording"></video>
    </article>`,
    )
    .join('\n')
}

const renderPage = (title: string, content: string): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #0f172a; background: #f5f7fb; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(1380px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 64px; }
    h1 { margin: 0 0 8px; font-size: clamp(2rem, 5vw, 3.25rem); letter-spacing: -0.04em; }
    .intro, .note { color: #475569; margin: 0 0 20px; font-size: 1.05rem; }
    .note { max-width: 82ch; }
    .recordings { margin: 36px 0 28px; }
    .card { background: white; border: 1px solid #d8e0ec; border-radius: 12px; padding: 28px 32px; margin: 16px 0; overflow: auto; }
    h2 { margin: 0 0 4px; font-size: 1.65rem; }
    h3 { margin: 0; font-size: 1.35rem; }
    .description { margin: 0 0 20px; color: #64748b; }
    .video-version { margin: 4px 0 18px; color: #64748b; }
    video { display: block; width: 100%; max-width: 1280px; aspect-ratio: 16 / 9; background: #0f172a; }
    img { display: block; width: 100%; min-width: 720px; }
    table { width: 100%; border-collapse: collapse; min-width: 1100px; }
    th, td { text-align: left; border-bottom: 1px solid #e2e8f0; padding: 14px 12px; white-space: nowrap; }
    thead th { color: #475569; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; }
    tbody th span { color: #64748b; font-weight: 400; }
    code { padding: 2px 6px; border-radius: 5px; background: #eef2f7; }
    .paint-command-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 480px), 1fr)); gap: 16px; margin-top: 24px; }
    .paint-command-card { min-width: 0; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; }
    .paint-command-card h3 span { color: #64748b; font-size: 1rem; font-weight: 400; }
    .paint-command-card p { color: #64748b; }
    .paint-command-card table { min-width: 0; }
  </style>
</head>
<body>
  <main>
    ${content}
  </main>
</body>
</html>
`

const renderHtml = (summary: RenderBenchmarkSummary, title: string): string => renderPage(title, `
    <p><a href="../">Editor typing benchmark</a> · <a href="../ide-startup/">IDE startup benchmark</a> · <a href="./videos.html">Recorded loads</a></p>
    <h1>${escapeHtml(title)}</h1>
    <p class="intro">${summary.lines}-line <code>${escapeHtml(summary.document)}</code> · generated ${escapeHtml(summary.generatedAt)}</p>
    <p class="note">Each editor-only fixture opens the same HTML in a fresh Chromium instance. Both LVCE variants, Monaco, and CodeMirror are compared without a surrounding IDE workbench.</p>
    ${charts
      .map(
        (chart) => `<section class="card">
      <h2>${escapeHtml(chart.title)}</h2>
      <p class="description">${escapeHtml(chart.description)}</p>
      <img src="./${chart.fileName}" alt="${escapeHtml(chart.title)} comparison chart">
    </section>`,
      )
      .join('\n')}
    <section class="card">
      <h2>Painting details</h2>
      <p class="description">Paint events, main-thread paint time, and cumulative clip area come from the Chromium trace after the benchmark navigation commits and until the highlighted document is ready. Areas may overlap, so they are work estimates rather than unique screen coverage. Paint commands come from available DevTools Paint Profiler snapshots captured after the timed load and memory sample; Chromium may reject a layer it previously marked as content-bearing when that layer has no paint record. Layer metrics describe the final composited layer tree.</p>
      <table>
        <thead><tr><th>Editor</th><th>Paint events</th><th>Paint time</th><th>Painted area</th><th>Largest paint</th><th>Paint commands</th><th>Layers</th><th>Content layers</th></tr></thead>
        <tbody>${renderPaintRows(summary)}</tbody>
      </table>
      <h3 class="paint-command-heading">Paint command breakdown</h3>
      <p class="description">These are the exact canvas command method names returned by Chromium's Paint Profiler. Counts include all available final content-layer snapshots in a fresh load and are summarized across measured runs.</p>
      <div class="paint-command-grid">${renderPaintCommandBreakdown(summary)}</div>
    </section>
    <section class="card">
      <h2>Results</h2>
      <p class="description">Average values are computed from successful measured iterations; charts also show the fastest run.</p>
      <table>
        <thead><tr><th>Editor</th><th>Runs</th><th>Failures</th><th>DOM loaded</th><th>Rendered</th><th>JavaScript</th><th>Renderer memory</th><th>GPU memory</th></tr></thead>
        <tbody>${renderRows(summary)}</tbody>
      </table>
    </section>
`)

const renderVideosHtml = (summary: RenderBenchmarkSummary, title: string): string => renderPage(`${title} — Recorded loads`, `
    <p><a href="./">Back to charts and tables</a></p>
    <h1>Recorded loads</h1>
    <p class="intro">${escapeHtml(title)} · ${summary.lines}-line <code>${escapeHtml(summary.document)}</code> · generated ${escapeHtml(summary.generatedAt)}</p>
    <section class="recordings" aria-label="Load recordings">
      <p class="description">Each video records one separate, fresh Chromium load from navigation until syntax highlighting is painted. Video capture is not included in the benchmark measurements.</p>
      ${renderLoadVideos(summary)}
    </section>
`)

export const writeRenderReport = async ({ input, output, title }: RenderReportOptions): Promise<void> => {
  const summary = JSON.parse(await readFile(join(input, 'summary.json'), 'utf8')) as RenderBenchmarkSummary
  await Promise.all([mkdir(output, { recursive: true }), mkdir(join(output, 'videos'), { recursive: true })])
  await Promise.all([
    ...charts.map((chart) => writeFile(join(output, chart.fileName), renderChart(summary, chart))),
    ...summary.editors.map((editor) =>
      copyFile(join(input, 'videos', `${editor.id}.webm`), join(output, 'videos', `${editor.id}.webm`)),
    ),
    writeFile(join(output, 'index.html'), renderHtml(summary, title)),
    writeFile(join(output, 'videos.html'), renderVideosHtml(summary, title)),
    copyFile(join(input, 'summary.json'), join(output, 'summary.json')),
  ])
}
