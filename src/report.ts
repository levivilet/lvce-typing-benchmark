import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { wrapChartLabel } from './chartLabels.ts'
import { writeCpuBreakdownReport } from './cpuBreakdownReport.ts'
import { typingLagCadence } from './typingLag.ts'
import type { BenchmarkSummary, CpuBreakdown, EditorSummary } from './types.ts'

interface ReportOptions {
  readonly input: string
  readonly output: string
  readonly title: string
}

interface ChartDefinition {
  readonly fileName: string
  readonly title: string
  readonly description: string
  readonly labels?: readonly [string, string]
  readonly getValues: (summary: EditorSummary) => readonly [number | null, number | null]
}

const charts: readonly ChartDefinition[] = [
  {
    fileName: 'typing-duration.svg',
    title: 'Typing duration',
    description: 'Wall-clock time to dispatch, process, and paint all keypresses.',
    getValues: (summary) => [summary.typingDurationMs.mean, summary.typingDurationMs.min],
  },
  {
    fileName: 'javascript-duration.svg',
    title: 'JavaScript execution',
    description: 'Total sampled JavaScript CPU time across the page and its workers.',
    getValues: (summary) => [summary.javascriptDurationMs.mean, summary.javascriptDurationMs.min],
  },
]

const lagCharts: readonly ChartDefinition[] = [
  {
    fileName: 'typing-lag.svg',
    title: 'Typing lag',
    description: 'Per-character keydown to Chromium paint completion, measured in a separate sequential pass. Lower is better.',
    getValues: (summary) => [summary.typingLag?.durationMs.mean ?? null, summary.typingLag?.durationMs.min ?? null],
  },
  {
    fileName: 'typing-lag-distribution.svg',
    title: 'Typing lag median and p95',
    description: 'Median and 95th-percentile delay across individual keystrokes.',
    labels: ['Median', 'p95'],
    getValues: (summary) => [summary.typingLag?.durationMs.median ?? null, summary.typingLag?.durationMs.p95 ?? null],
  },
]

const getCharts = (summary: BenchmarkSummary): readonly ChartDefinition[] => {
  return summary.editors.some((editor) => editor.typingLag) ? [...charts, ...lagCharts] : charts
}

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
  const left = 124
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
    return chart.getValues(editor).filter((value): value is number => value !== null)
  })
  const max = Math.max(1, ...values) * 1.12
  const toY = (value: number): number => top + chartHeight - (value / max) * chartHeight
  const barWidth = Math.min(72, groupWidth * 0.28)
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = (max * index) / 4
    const y = toY(value)
    return `<line class="grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" />
<text class="axis-label" x="${left - 14}" y="${y + 5}" text-anchor="end">${formatNumber(value)} ms</text>`
  }).join('\n')
  const groups = summary.editors
    .map((editor, index) => {
      const [first, second] = chart.getValues(editor)
      const center = left + groupWidth * (index + 0.5)
      const bars = [
        { value: first, className: 'average', x: center - barWidth - 4 },
        { value: second, className: 'fastest', x: center + 4 },
      ]
        .map(({ value, className, x }) => {
          if (value === null) {
            return ''
          }
          const y = toY(value)
          const barHeight = top + chartHeight - y
          // Separate nearby values vertically so labels wider than their bars remain readable.
          const labelY = className === 'average' && second !== null && Math.abs(y - toY(second)) < 22
            ? Math.min(y - 8, toY(second) - 30)
            : y - 8
          return `<rect class="${className}" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" />
<text class="value" x="${x + barWidth / 2}" y="${labelY}" text-anchor="middle">${formatNumber(value)}</text>`
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
    .value { font-size: 14px; font-weight: 650; fill: #0f172a; }
    .average { fill: #2563eb; }
    .fastest { fill: #0d9488; }
  </style>
  <rect width="${width}" height="${height}" fill="#ffffff" />
  ${grid}
  <line x1="${left}" y1="${top + chartHeight}" x2="${width - right}" y2="${top + chartHeight}" stroke="#94a3b8" />
  ${groups}
  <circle cx="${width - 255}" cy="25" r="7" fill="#2563eb" />
  <text x="${width - 240}" y="30" font-size="15">${chart.labels?.[0] ?? 'Average'}</text>
  <circle cx="${width - 145}" cy="25" r="7" fill="#0d9488" />
  <text x="${width - 130}" y="30" font-size="15">${chart.labels?.[1] ?? 'Fastest'}</text>
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

const renderLagResults = (summary: BenchmarkSummary): string => {
  if (summary.editors.every((editor) => !editor.typingLag)) {
    return ''
  }
  const rows = summary.editors.map((editor) => {
    const lag = editor.typingLag
    const stats = lag?.durationMs
    return `<tr><th scope="row">${escapeHtml(editor.label)}</th>
      <td>${lag?.cadence === typingLagCadence ? '16–65 ms varied' : 'Immediate (legacy)'}</td>
      <td>${lag?.samples ?? 0} / ${lag?.requestedSamples ?? 0}</td><td>${lag?.failures ?? 0}</td>
      ${[stats?.min, stats?.mean, stats?.median, stats?.p95, stats?.max].map((value) => `<td>${formatNumber(value ?? null)} ms</td>`).join('')}
    </tr>`
  }).join('\n')
  return `<section class="card">
    <h2>Typing lag results</h2>
    <p class="description">Each editor starts with a fresh, loaded empty document. One character is typed at a time, waiting for its text DOM update and paint before the next key. Samples include the first keystroke; no latency warmup is discarded. The cadence column identifies the pause before each key: current runs use the same reproducible sequence of 16–65 ms pauses for every editor, outside the measured interval. This avoids synchronizing inputs to the refresh cycle. Legacy immediate-dispatch results are biased toward a particular refresh phase and are not directly comparable.</p>
    <p class="description">The metric runs from the trusted keydown event timestamp to completion of the first Chromium paint lifecycle containing a main-frame Paint after the character reaches the text DOM. Trace collection is enabled without CPU sampling. This measures browser paint work, excluding later GPU rasterization, compositing, and physical display latency. Frame scheduling and instrumentation affect the results. The number includes waiting for the browser to schedule a paint; it is not pure editor execution time. Small differences between editors may reflect scheduling or tracing overhead.</p>
    <p class="description">Missing text updates or paint evidence fail the pass; failed passes show n/a. <a href="./typing-lag.json">Download individual samples</a>.</p>
    <table><thead><tr><th>Editor</th><th>Cadence</th><th>Samples / requested</th><th>Failed passes</th><th>Fastest</th><th>Average</th><th>Median</th><th>p95</th><th>Slowest</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </section>`
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
    ${getCharts(summary)
      .map(
        (chart) => `<section class="card">
      <h2>${escapeHtml(chart.title)}</h2>
      <p class="description">${escapeHtml(chart.description)}</p>
      <img src="./${chart.fileName}" alt="${escapeHtml(chart.title)} comparison chart">
    </section>`,
      )
      .join('\n')}
    ${renderLagResults(summary)}
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
    ...getCharts(summary).map((chart) => writeFile(join(output, chart.fileName), renderChart(summary, chart))),
    writeFile(join(output, 'index.html'), renderHtml(summary, title)),
    copyFile(join(input, 'summary.json'), join(output, 'summary.json')),
    ...(summary.editors.some((editor) => editor.typingLag) ? [copyFile(join(input, 'typing-lag.json'), join(output, 'typing-lag.json'))] : []),
    writeCpuBreakdownReport({
      breakdown: cpuBreakdown,
      output: join(output, 'lvce-cpu'),
      source: join(input, 'cpu-breakdown.json'),
      summary,
    }),
  ])
}
