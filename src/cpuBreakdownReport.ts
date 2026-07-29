import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BenchmarkSummary, CpuBreakdown } from './types.ts'

const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

const renderContextRows = (breakdown: CpuBreakdown): string => {
  return breakdown.contexts
    .map(
      (context) => `<tr>
  <th scope="row">${escapeHtml(context.name)} <span>${context.kind === 'main' ? 'main thread' : 'web worker'}</span></th>
  <td>${formatNumber(context.selfMs)} ms</td>
  <td>${formatNumber(context.share)}%</td>
  <td>${context.functionCount}</td>
</tr>`,
    )
    .join('\n')
}

const renderHotspotRows = (breakdown: CpuBreakdown): string => {
  return breakdown.hotspots
    .slice(0, 50)
    .map(
      (hotspot) => `<tr>
  <th scope="row">${escapeHtml(hotspot.functionName)} <span>${escapeHtml(hotspot.source)}:${hotspot.lineNumber + 1}:${hotspot.columnNumber + 1}</span></th>
  <td>${escapeHtml(hotspot.context)}</td>
  <td>${formatNumber(hotspot.selfMs)} ms</td>
  <td>${formatNumber(hotspot.share)}%</td>
  <td>${formatNumber(hotspot.inclusiveMs)} ms</td>
  <td>${formatNumber(hotspot.samples)}</td>
</tr>`,
    )
    .join('\n')
}

const renderBars = (breakdown: CpuBreakdown): string => {
  const hotspots = breakdown.hotspots.filter((hotspot) => hotspot.selfMs > 0).slice(0, 15)
  const maximum = Math.max(0, ...hotspots.map((hotspot) => hotspot.selfMs))
  return hotspots
    .map((hotspot) => {
      const width = maximum === 0 ? 0 : (hotspot.selfMs / maximum) * 100
      return `<div class="bar-row">
  <div class="bar-label"><strong>${escapeHtml(hotspot.functionName)}</strong><small>${escapeHtml(hotspot.context)} · ${escapeHtml(hotspot.source)}:${hotspot.lineNumber + 1}</small></div>
  <div class="bar-track"><div class="bar" style="width:${width}%"></div></div>
  <strong class="bar-value">${formatNumber(hotspot.selfMs)} ms</strong>
</div>`
    })
    .join('\n')
}

const renderHtml = (summary: BenchmarkSummary, breakdown: CpuBreakdown): string => {
  const lvce = summary.editors.find((editor) => editor.id === 'lvce-editor-minimal')
  const workerShare = breakdown.contexts
    .filter((context) => context.kind === 'worker')
    .reduce((total, context) => total + context.share, 0)
  const mainShare = breakdown.contexts
    .filter((context) => context.kind === 'main')
    .reduce((total, context) => total + context.share, 0)
  const leadingContext = breakdown.contexts[0]
  const leadingHotspot = breakdown.hotspots.find((hotspot) => hotspot.selfMs > 0)
  const receiveHotspot = breakdown.hotspots.find(
    (hotspot) => hotspot.context === 'Renderer worker' && hotspot.functionName.startsWith('getData'),
  )
  const sendHotspot = breakdown.hotspots.find(
    (hotspot) => hotspot.context === 'Editor worker' && hotspot.functionName === 'send',
  )
  const boundaryFinding =
    receiveHotspot && sendHotspot
      ? ` The receive/send pair consumes ${formatNumber(receiveHotspot.share + sendHotspot.share)}% together. Those locations read <code>MessageEvent.data</code> and call <code>MessagePort.postMessage</code>, pointing to message materialization and structured-clone work at the editor-worker boundary.`
      : ''
  const typingMean = lvce?.typingDurationMs.mean || 0
  const sampledJavaScriptMean = lvce?.javascriptDurationMs.mean || 0
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Function-level CPU profile analysis for LVCE Editor typing">
  <title>LVCE typing CPU breakdown</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #edf6ff; background: #07111f; }
    * { box-sizing: border-box; }
    body { min-width: 320px; margin: 0; background: radial-gradient(circle at 12% -10%, rgb(22 197 170 / 20%), transparent 36rem), radial-gradient(circle at 100% 0%, rgb(72 109 255 / 17%), transparent 34rem), #07111f; }
    main { width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 64px 0; }
    h1, h2, p { margin-top: 0; }
    h1 { max-width: 850px; margin-bottom: 18px; font-size: clamp(2.8rem, 8vw, 6.4rem); letter-spacing: -0.065em; line-height: 0.94; }
    h2 { margin-bottom: 0; font-size: clamp(1.35rem, 3vw, 2rem); letter-spacing: -0.035em; }
    code { color: #dce9f7; }
    .hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; margin-bottom: 40px; }
    .intro { max-width: 720px; margin-bottom: 0; color: #9db0c6; font-size: 1.08rem; line-height: 1.7; }
    .links { display: flex; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
    .pill { border: 1px solid #2b4059; border-radius: 999px; color: #d8e8f8; padding: 10px 16px; text-decoration: none; }
    .pill:hover { border-color: #48d7bd; color: #48d7bd; }
    .eyebrow { margin-bottom: 10px; color: #48d7bd; font-size: .72rem; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    .metadata { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
    .meta-card { min-width: 0; min-height: 118px; border: 1px solid #1d3046; border-radius: 14px; background: rgb(12 27 44 / 78%); padding: 18px; }
    .meta-card span { display: block; margin-bottom: 12px; color: #768ca5; font-size: .7rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .meta-card strong { display: block; color: #edf6ff; font-size: 1.05rem; }
    .meta-card small { display: block; margin-top: 6px; color: #8ba0b8; }
    .finding { border-left: 3px solid #48d7bd; color: #b8cadc; line-height: 1.7; padding: 4px 0 4px 18px; }
    .panel { min-width: 0; margin-top: 20px; overflow: hidden; border: 1px solid #1d3046; border-radius: 18px; background: rgb(10 23 38 / 88%); box-shadow: 0 26px 80px rgb(0 0 0 / 22%); padding: 26px; }
    .panel-heading { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
    .hint { margin: 0; color: #7288a1; font-size: .8rem; }
    .chart { display: grid; gap: 12px; }
    .bar-row { display: grid; grid-template-columns: minmax(200px, 1.4fr) minmax(180px, 4fr) 84px; align-items: center; gap: 16px; }
    .bar-label { min-width: 0; }
    .bar-label strong, .bar-label small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-label strong { font-size: .88rem; }
    .bar-label small { margin-top: 3px; color: #7288a1; font-size: .7rem; }
    .bar-track { height: 18px; overflow: hidden; border-radius: 999px; background: #101f31; }
    .bar { height: 100%; min-width: 3px; border-radius: inherit; background: linear-gradient(90deg, #22bca6, #5a75ff); }
    .bar-value { font-size: .88rem; font-variant-numeric: tabular-nums; text-align: right; }
    .table-scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    th, td { border-bottom: 1px solid #172a40; padding: 14px 12px; text-align: right; white-space: nowrap; }
    th:first-child, td:first-child { padding-left: 0; text-align: left; }
    thead th { color: #7188a2; font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; }
    tbody th, td { color: #c9d8e7; font-size: .86rem; }
    tbody th span { display: block; max-width: 440px; margin-top: 4px; overflow: hidden; color: #7188a2; font-size: .72rem; font-weight: 400; text-overflow: ellipsis; }
    .methodology { max-width: 820px; padding: 56px 4px 10px; }
    .methodology p:last-child { margin-top: 16px; color: #8fa4bb; line-height: 1.75; }
    @media (max-width: 850px) { .hero, .panel-heading { align-items: flex-start; flex-direction: column; } .links { justify-content: flex-start; } .metadata { grid-template-columns: repeat(2, minmax(0, 1fr)); } .bar-row { grid-template-columns: 1fr 72px; } .bar-track { grid-column: 1 / -1; grid-row: 2; } }
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <div>
        <p class="eyebrow">Browser-wide V8 sampling</p>
        <h1>LVCE Editor Only typing CPU breakdown</h1>
        <p class="intro">Function-level self and inclusive CPU time across the minimal renderer process and its LVCE web workers while typing 500 characters.</p>
      </div>
      <nav class="links"><a class="pill" href="../">Editor comparison</a><a class="pill" href="./cpu-breakdown.json">Raw analysis</a></nav>
    </header>
    <section class="metadata" aria-label="Profile summary">
      <article class="meta-card"><span>Typing wall time</span><strong>${formatNumber(typingMean)} ms</strong><small>mean per run</small></article>
      <article class="meta-card"><span>All sampled JavaScript</span><strong>${formatNumber(sampledJavaScriptMean)} ms</strong><small>page and workers per run</small></article>
      <article class="meta-card"><span>LVCE bundle self CPU</span><strong>${formatNumber(breakdown.lvceJavaScriptMs)} ms</strong><small>${breakdown.iterations} profiled runs</small></article>
      <article class="meta-card"><span>Worker / main split</span><strong>${formatNumber(workerShare)}% / ${formatNumber(mainShare)}%</strong><small>LVCE bundle self CPU</small></article>
    </section>
    <section class="panel">
      <p class="finding">${leadingContext ? `${escapeHtml(leadingContext.name)} is the largest execution context at ${formatNumber(leadingContext.share)}% of LVCE bundle self CPU.` : 'No LVCE CPU samples were captured.'}${leadingHotspot ? ` The largest leaf hotspot is <code>${escapeHtml(leadingHotspot.functionName)}</code> at ${formatNumber(leadingHotspot.share)}%.` : ''}${boundaryFinding} Moving work to workers keeps it off the main thread, but does not remove its CPU cost or the latency of serial message round trips.</p>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><p class="eyebrow">Filtered self time</p><h2>Largest LVCE hotspots</h2></div><p class="hint">Average milliseconds per typing run</p></div>
      <div class="chart">${renderBars(breakdown)}</div>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><p class="eyebrow">Execution contexts</p><h2>Main thread and workers</h2></div><p class="hint">LVCE bundle self CPU only</p></div>
      <div class="table-scroll"><table><thead><tr><th>Context</th><th>Self CPU per run</th><th>Share</th><th>Functions</th></tr></thead><tbody>${renderContextRows(breakdown)}</tbody></table></div>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><p class="eyebrow">Sampled stacks</p><h2>LVCE functions</h2></div><p class="hint">Top 50 ordered by self CPU</p></div>
      <div class="table-scroll"><table><thead><tr><th>Function</th><th>Context</th><th>Self CPU per run</th><th>Share</th><th>Inclusive per run</th><th>Samples/run</th></tr></thead><tbody>${renderHotspotRows(breakdown)}</tbody></table></div>
    </section>
    <section class="methodology">
      <p class="eyebrow">Methodology</p>
      <h2>How to read this profile</h2>
      <p>Chrome tracing records V8 samples for the page and all dedicated workers during each measured typing interval. Self time is attributed to the sampled leaf function. Inclusive time also credits LVCE ancestors on that sample's stack, including time below them in native browser calls, so inclusive rows are not additive. Values are totals across all traces divided by ${Math.max(1, breakdown.iterations)} runs. Bundle line and column numbers are zero-based in the trace and displayed here as one-based locations. The gap between wall time and JavaScript CPU is not necessarily idle time: workers can execute concurrently, and the wall-clock path also includes browser input dispatch, rendering, scheduling, and cross-thread waits.</p>
    </section>
  </main>
</body>
</html>`
}

export const writeCpuBreakdownReport = async ({
  breakdown,
  output,
  source,
  summary,
}: {
  readonly breakdown: CpuBreakdown
  readonly output: string
  readonly source: string
  readonly summary: BenchmarkSummary
}): Promise<void> => {
  await mkdir(output, { recursive: true })
  await Promise.all([
    writeFile(join(output, 'index.html'), renderHtml(summary, breakdown)),
    copyFile(source, join(output, 'cpu-breakdown.json')),
  ])
}
