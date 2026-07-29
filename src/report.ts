import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeCpuBreakdownReport } from './cpuBreakdownReport.ts'
import type { BenchmarkSummary, CpuBreakdown, EditorSummary, Stats } from './types.ts'

interface ReportOptions {
  readonly input: string
  readonly output: string
  readonly title: string
}

interface ChartDefinition {
  readonly fileName: string
  readonly title: string
  readonly description: string
  readonly getStats: (summary: EditorSummary) => Stats
}

const charts: readonly ChartDefinition[] = [
  {
    fileName: 'typing-duration.svg',
    title: 'Typing duration',
    description: 'Wall-clock time to dispatch, process, and paint all keypresses.',
    getStats: (summary) => summary.typingDurationMs,
  },
  {
    fileName: 'javascript-duration.svg',
    title: 'JavaScript execution',
    description: 'Total sampled JavaScript CPU time across the page and its workers.',
    getStats: (summary) => summary.javascriptDurationMs,
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

const formatNumber = (value: number | null): string => {
  return value === null ? 'n/a' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

const renderChart = (summary: BenchmarkSummary, chart: ChartDefinition): string => {
  const width = 1_200
  const height = 460
  const left = 124
  const right = 30
  const top = 62
  const bottom = 96
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const values = summary.editors.flatMap((editor) => {
    const stats = chart.getStats(editor)
    return [stats.mean, stats.min].filter((value): value is number => value !== null)
  })
  const max = Math.max(1, ...values) * 1.12
  const toY = (value: number): number => top + chartHeight - (value / max) * chartHeight
  const groupWidth = chartWidth / Math.max(1, summary.editors.length)
  const barWidth = Math.min(72, groupWidth * 0.28)
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = (max * index) / 4
    const y = toY(value)
    return `<line class="grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" />
<text class="axis-label" x="${left - 14}" y="${y + 5}" text-anchor="end">${formatNumber(value)} ms</text>`
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
          return `<rect class="${className}" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" />
<text class="value" x="${x + barWidth / 2}" y="${Math.max(top + 14, y - 8)}" text-anchor="middle">${formatNumber(value)}</text>`
        })
        .join('\n')
      return `${bars}
<text class="editor-label" x="${center}" y="${height - bottom + 30}" text-anchor="middle">${escapeHtml(editor.label)}</text>
<text class="version-label" x="${center}" y="${height - bottom + 52}" text-anchor="middle">v${escapeHtml(editor.version)}</text>`
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
    .value { font-size: 14px; font-weight: 650; fill: #0f172a; }
    .average { fill: #2563eb; }
    .fastest { fill: #0d9488; }
  </style>
  <rect width="${width}" height="${height}" fill="#ffffff" />
  ${grid}
  <line x1="${left}" y1="${top + chartHeight}" x2="${width - right}" y2="${top + chartHeight}" stroke="#94a3b8" />
  ${groups}
  <circle cx="${width - 255}" cy="25" r="7" fill="#2563eb" />
  <text x="${width - 240}" y="30" font-size="15">Average</text>
  <circle cx="${width - 145}" cy="25" r="7" fill="#0d9488" />
  <text x="${width - 130}" y="30" font-size="15">Fastest</text>
</svg>`
}

const renderRows = (summary: BenchmarkSummary): string => {
  return summary.editors
    .map(
      (editor) => `<tr>
  <th scope="row">${escapeHtml(editor.label)} <span>v${escapeHtml(editor.version)}</span></th>
  <td>${editor.iterations}</td>
  <td>${editor.failures}</td>
  <td>${formatNumber(editor.typingDurationMs.mean)} ms</td>
  <td>${formatNumber(editor.typingDurationMs.min)} ms</td>
  <td>${formatNumber(editor.javascriptDurationMs.mean)} ms</td>
  <td>${formatNumber(editor.javascriptDurationMs.min)} ms</td>
</tr>`,
    )
    .join('\n')
}

const renderHtml = (summary: BenchmarkSummary, title: string): string => `<!doctype html>
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
    .intro { color: #475569; margin: 0 0 32px; font-size: 1.05rem; }
    .card { background: white; border: 1px solid #d8e0ec; border-radius: 12px; padding: 28px 32px; margin: 16px 0; overflow: auto; }
    h2 { margin: 0 0 4px; font-size: 1.65rem; }
    .description { margin: 0 0 20px; color: #64748b; }
    img { display: block; width: 100%; min-width: 720px; }
    table { width: 100%; border-collapse: collapse; min-width: 900px; }
    th, td { text-align: left; border-bottom: 1px solid #e2e8f0; padding: 14px 12px; white-space: nowrap; }
    thead th { color: #475569; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; }
    tbody th span { color: #64748b; font-weight: 400; }
    code { padding: 2px 6px; border-radius: 5px; background: #eef2f7; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="intro">${summary.characters} <code>a</code> keypresses per iteration · generated ${escapeHtml(summary.generatedAt)}</p>
    <p><a href="./ide-startup/">IDE startup benchmark</a></p>
    <p><a href="./rendering/">Syntax highlight rendering benchmark</a></p>
    <p><a href="./lvce-cpu/">LVCE Editor Only CPU breakdown</a></p>
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
      <h2>Results</h2>
      <p class="description">Average and fastest values are computed from successful measured iterations.</p>
      <table>
        <thead><tr><th>Editor</th><th>Runs</th><th>Failures</th><th>Typing average</th><th>Typing fastest</th><th>JavaScript average</th><th>JavaScript fastest</th></tr></thead>
        <tbody>${renderRows(summary)}</tbody>
      </table>
    </section>
  </main>
</body>
</html>
`

export const writeReport = async ({ input, output, title }: ReportOptions): Promise<void> => {
  const summary = JSON.parse(await readFile(join(input, 'summary.json'), 'utf8')) as BenchmarkSummary
  const cpuBreakdown = JSON.parse(await readFile(join(input, 'cpu-breakdown.json'), 'utf8')) as CpuBreakdown
  await mkdir(output, { recursive: true })
  await Promise.all([
    ...charts.map((chart) => writeFile(join(output, chart.fileName), renderChart(summary, chart))),
    writeFile(join(output, 'index.html'), renderHtml(summary, title)),
    copyFile(join(input, 'summary.json'), join(output, 'summary.json')),
    writeCpuBreakdownReport({
      breakdown: cpuBreakdown,
      output: join(output, 'lvce-cpu'),
      source: join(input, 'cpu-breakdown.json'),
      summary,
    }),
  ])
}
