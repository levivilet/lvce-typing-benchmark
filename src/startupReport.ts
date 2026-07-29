import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StartupBenchmarkSummary, StartupIdeSummary } from './startupTypes.ts'
import type { Stats } from './types.ts'

interface StartupReportOptions {
  readonly input: string
  readonly output: string
  readonly title: string
}

interface ChartDefinition {
  readonly description: string
  readonly fileName: string
  readonly getStats: (summary: StartupIdeSummary) => Stats
  readonly title: string
}

const charts: readonly ChartDefinition[] = [
  {
    description: 'Navigation start until the visible workbench shell has painted.',
    fileName: 'startup-duration.svg',
    getStats: (summary) => summary.startupDurationMs,
    title: 'IDE startup time',
  },
  {
    description: 'Total sampled JavaScript CPU time across the page and its workers during startup.',
    fileName: 'javascript-duration.svg',
    getStats: (summary) => summary.javascriptDurationMs,
    title: 'JavaScript execution',
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

const formatBytes = (value: number | null): string => {
  if (value === null) {
    return 'n/a'
  }
  return `${formatNumber(value / 1_000_000)} MB`
}

const formatDurationShare = (duration: number | null, startup: number | null): string => {
  if (duration === null) {
    return 'n/a'
  }
  if (startup === null || startup === 0) {
    return `${formatNumber(duration)} ms`
  }
  return `${formatNumber(duration)} ms (${formatNumber((duration / startup) * 100)}%)`
}

const renderChart = (summary: StartupBenchmarkSummary, chart: ChartDefinition): string => {
  const width = 1_200
  const height = 460
  const left = 124
  const right = 30
  const top = 62
  const bottom = 96
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const values = summary.ides.flatMap((ide) => {
    const stats = chart.getStats(ide)
    return [stats.mean, stats.min].filter((value): value is number => value !== null)
  })
  const max = Math.max(1, ...values) * 1.12
  const toY = (value: number): number => top + chartHeight - (value / max) * chartHeight
  const groupWidth = chartWidth / Math.max(1, summary.ides.length)
  const barWidth = Math.min(90, groupWidth * 0.22)
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = (max * index) / 4
    const y = toY(value)
    return `<line class="grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" />
<text class="axis-label" x="${left - 14}" y="${y + 5}" text-anchor="end">${formatNumber(value)} ms</text>`
  }).join('\n')
  const groups = summary.ides
    .map((ide, index) => {
      const stats = chart.getStats(ide)
      const center = left + groupWidth * (index + 0.5)
      const bars = [
        { className: 'average', value: stats.mean, x: center - barWidth - 5 },
        { className: 'fastest', value: stats.min, x: center + 5 },
      ]
        .map(({ className, value, x }) => {
          if (value === null) {
            return ''
          }
          const y = toY(value)
          return `<rect class="${className}" x="${x}" y="${y}" width="${barWidth}" height="${top + chartHeight - y}" rx="5" />
<text class="value" x="${x + barWidth / 2}" y="${Math.max(top + 14, y - 8)}" text-anchor="middle">${formatNumber(value)}</text>`
        })
        .join('\n')
      return `${bars}
<text class="ide-label" x="${center}" y="${height - bottom + 30}" text-anchor="middle">${escapeHtml(ide.label)}</text>
<text class="version-label" x="${center}" y="${height - bottom + 52}" text-anchor="middle">v${escapeHtml(ide.version)}</text>`
    })
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeHtml(chart.title)}</title>
  <desc id="description">${escapeHtml(chart.description)}</desc>
  <style>
    text { font-family: Inter, ui-sans-serif, system-ui, sans-serif; fill: #334155; }
    .grid { stroke: #dbe3ef; stroke-width: 1; }
    .axis-label, .version-label { font-size: 14px; }
    .ide-label { font-size: 17px; font-weight: 650; fill: #0f172a; }
    .value { font-size: 14px; font-weight: 650; fill: #0f172a; }
    .average { fill: #7c3aed; }
    .fastest { fill: #0d9488; }
  </style>
  <rect width="${width}" height="${height}" fill="#ffffff" />
  ${grid}
  <line x1="${left}" y1="${top + chartHeight}" x2="${width - right}" y2="${top + chartHeight}" stroke="#94a3b8" />
  ${groups}
  <circle cx="${width - 255}" cy="25" r="7" fill="#7c3aed" />
  <text x="${width - 240}" y="30" font-size="15">Average</text>
  <circle cx="${width - 145}" cy="25" r="7" fill="#0d9488" />
  <text x="${width - 130}" y="30" font-size="15">Fastest</text>
</svg>`
}

const renderRows = (summary: StartupBenchmarkSummary): string => {
  return summary.ides
    .map(
      (ide) => `<tr>
  <th scope="row">${escapeHtml(ide.label)} <span>v${escapeHtml(ide.version)}</span></th>
  <td>${ide.iterations}</td>
  <td>${ide.failures}</td>
  <td>${formatNumber(ide.startupDurationMs.mean)} ms</td>
  <td>${formatNumber(ide.startupDurationMs.min)} ms</td>
  <td>${formatNumber(ide.startupDurationMs.p95)} ms</td>
  <td>${formatNumber(ide.javascriptDurationMs.mean)} ms</td>
</tr>`,
    )
    .join('\n')
}

const renderVideos = (summary: StartupBenchmarkSummary): string => {
  return summary.ides
    .map(
      (ide) => `<article>
  <h3>${escapeHtml(ide.label)} <span>v${escapeHtml(ide.version)}</span></h3>
  <video controls muted playsinline preload="metadata" src="./videos/${escapeHtml(ide.id)}.webm"></video>
</article>`,
    )
    .join('\n')
}

const renderBreakdownHeaders = (summary: StartupBenchmarkSummary): string => {
  return summary.ides
    .map((ide) => `<th>${escapeHtml(ide.label)} average</th>`)
    .join('')
}

const renderDurationBreakdown = (summary: StartupBenchmarkSummary): string => {
  const rows = [
    {
      description: 'Sampled V8 function execution across the page and workers.',
      getValue: (ide: StartupIdeSummary) => ide.javascriptDurationMs.mean,
      label: 'JavaScript execution',
    },
    {
      description: 'Script and ES module compilation, including background parsing.',
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.compileParseMs.mean,
      label: 'Module compile / parse',
    },
    {
      description: 'V8 isolate deserialization and JavaScript context creation.',
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.v8InitializationMs.mean,
      label: 'V8 / context initialization',
    },
    {
      description: 'Starting the trace CPU profilers for the page and worker contexts.',
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.profilerStartupMs.mean,
      label: 'CPU profiler startup',
    },
    {
      description: 'Minor, major, and V8 garbage-collection events.',
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.garbageCollectionMs.mean,
      label: 'Garbage collection',
    },
    {
      description: 'HTML and CSS parsing, style, layout, pre-paint, paint, and layerization.',
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.renderMs.mean,
      label: 'Browser rendering',
    },
    {
      description: 'Handling posted messages between page and worker contexts.',
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.messageHandlingMs.mean,
      label: 'Message handling',
    },
  ] as const
  return rows
    .map(
      (row) => `<tr>
  <th scope="row">${row.label}</th>
  ${summary.ides
    .map((ide) => `<td>${formatDurationShare(row.getValue(ide), ide.startupDurationMs.mean)}</td>`)
    .join('')}
  <td class="meaning">${row.description}</td>
</tr>`,
    )
    .join('\n')
}

const renderStartupShape = (summary: StartupBenchmarkSummary): string => {
  const rows = [
    {
      format: (value: number | null) => `${formatNumber(value)} ms`,
      getValue: (ide: StartupIdeSummary) => ide.domContentLoadedMs.mean,
      label: 'DOMContentLoaded',
    },
    {
      format: (value: number | null) => `${formatNumber(value)} ms`,
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.postDomContentLoadedMs.mean,
      label: 'After DOMContentLoaded',
    },
    {
      format: formatBytes,
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.totalResourceBytes.mean,
      label: 'Trace-visible decoded resources',
    },
    {
      format: formatBytes,
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.largestScriptBytes.mean,
      label: 'Largest script',
    },
    {
      format: (value: number | null) => `${formatNumber(value)} ms`,
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.largestScriptTransferMs.mean,
      label: 'Largest script transfer',
    },
    {
      format: formatNumber,
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.requestCount.mean,
      label: 'Completed trace-visible requests',
    },
    {
      format: formatNumber,
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.dedicatedWorkerThreadCount.mean,
      label: 'Dedicated worker threads',
    },
    {
      format: formatNumber,
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.compiledModuleCount.mean,
      label: 'Compiled modules',
    },
    {
      format: formatNumber,
      getValue: (ide: StartupIdeSummary) => ide.traceBreakdown.profilerStartCount.mean,
      label: 'Profiled JavaScript contexts',
    },
  ] as const
  return rows
    .map(
      (row) => `<tr>
  <th scope="row">${row.label}</th>
  ${summary.ides.map((ide) => `<td>${row.format(row.getValue(ide))}</td>`).join('')}
</tr>`,
    )
    .join('\n')
}

const renderHtml = (summary: StartupBenchmarkSummary, title: string): string => `<!doctype html>
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
    .intro, .description { color: #64748b; }
    .intro { margin: 0 0 20px; font-size: 1.05rem; max-width: 880px; }
    nav { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 28px; }
    .card { background: white; border: 1px solid #d8e0ec; border-radius: 12px; padding: 28px 32px; margin: 16px 0; overflow: auto; }
    h2 { margin: 0 0 4px; font-size: 1.65rem; }
    h3 { margin: 0 0 12px; font-size: 1rem; }
    h3 span, tbody th span { color: #64748b; font-weight: 400; }
    .description { margin: 0 0 20px; }
    .videos { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 24px; }
    video { display: block; width: 100%; border-radius: 8px; background: #0f172a; }
    img { display: block; width: 100%; min-width: 720px; }
    table { width: 100%; border-collapse: collapse; min-width: 940px; }
    th, td { text-align: left; border-bottom: 1px solid #e2e8f0; padding: 14px 12px; white-space: nowrap; }
    thead th { color: #475569; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; }
    td.meaning { color: #64748b; white-space: normal; min-width: 360px; }
    .callout { color: #475569; background: #f8fafc; border-left: 4px solid #7c3aed; padding: 14px 16px; margin: 18px 0 24px; }
    .subheading { margin-top: 30px; }
    code { padding: 2px 6px; border-radius: 5px; background: #eef2f7; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="intro">Fresh Chromium process and browser storage per run · local assets · empty workspace · generated ${escapeHtml(summary.generatedAt)}</p>
    <p class="intro">Startup ends after the visible workbench shell is present and has painted for two animation frames. The LVCE server and static file server are started before measurement, so this compares browser-side IDE startup rather than server boot time.</p>
    <nav><a href="../">Editor typing benchmark</a><a href="../rendering/">Syntax highlight rendering benchmark</a></nav>
    <section class="card">
      <h2>Recorded startups</h2>
      <p class="description">Reference recordings use separate fresh loads and are not included in benchmark measurements.</p>
      <div class="videos">${renderVideos(summary)}</div>
    </section>
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
      <p class="description">VS Code is the pinned static web build published by GitHub1s; LVCE uses its pinned published web assets and local server.</p>
      <table>
        <thead><tr><th>IDE</th><th>Runs</th><th>Failures</th><th>Startup average</th><th>Startup fastest</th><th>Startup p95</th><th>JavaScript average</th></tr></thead>
        <tbody>${renderRows(summary)}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>Where startup time goes</h2>
      <p class="description">Average attribution from the Chromium startup traces. Percentages compare each duration with that IDE's average startup wall time.</p>
      <p class="callout"><strong>These rows do not add up to 100%.</strong> Trace categories can overlap, run in parallel on separate threads, or sit inside other categories. JavaScript is sampled V8 function time; compile/parse, profiler setup, V8 initialization, rendering, and browser work are recorded separately. CPU profiler startup is measurement overhead from profiled runs and is shown explicitly.</p>
      <table>
        <thead><tr><th>Trace category</th>${renderBreakdownHeaders(summary)}<th>What it includes</th></tr></thead>
        <tbody>${renderDurationBreakdown(summary)}</tbody>
      </table>
      <h3 class="subheading">Startup shape</h3>
      <p class="description">Counts and resource figures are averages per run. “Trace-visible” means Chromium emitted matching resource events; it may omit some worker or cached activity.</p>
      <table>
        <thead><tr><th>Signal</th>${renderBreakdownHeaders(summary)}</tr></thead>
        <tbody>${renderStartupShape(summary)}</tbody>
      </table>
    </section>
  </main>
</body>
</html>
`

export const writeStartupReport = async ({ input, output, title }: StartupReportOptions): Promise<void> => {
  const summary = JSON.parse(await readFile(join(input, 'summary.json'), 'utf8')) as StartupBenchmarkSummary
  await Promise.all([mkdir(output, { recursive: true }), mkdir(join(output, 'videos'), { recursive: true })])
  await Promise.all([
    ...charts.map((chart) => writeFile(join(output, chart.fileName), renderChart(summary, chart))),
    ...summary.ides.map((ide) =>
      copyFile(join(input, 'videos', `${ide.id}.webm`), join(output, 'videos', `${ide.id}.webm`)),
    ),
    copyFile(join(input, 'summary.json'), join(output, 'summary.json')),
    writeFile(join(output, 'index.html'), renderHtml(summary, title)),
  ])
}
