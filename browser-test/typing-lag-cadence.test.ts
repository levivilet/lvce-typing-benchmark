import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runBenchmark } from '../src/benchmark.ts'
import { parseArgs } from '../src/cli.ts'
import type { TraceProfile } from '../src/types.ts'

test('production latency loop pauses between keys and covers different refresh phases', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'typing-cadence-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  // Native contenteditable control: exercise the production runner without an editor library.
  await writeFile(join(directory, 'index.html'), `<!doctype html><div id="editor" contenteditable style="font:16px monospace;min-height:100px"></div>
<script>
const editor = document.querySelector('#editor');
window.__typingBenchmark = { focus: () => editor.focus(), getText: () => editor.textContent };
document.documentElement.dataset.benchmarkReady = 'true';
</script>`)
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({
    editors: [{ id: 'codejar-prism', label: 'Native text control', version: 'test', kind: 'static', path: 'index.html' }],
  }))
  const output = join(directory, 'results')
  await runBenchmark(parseArgs([
    '--static', directory, '--output', output, '--editors', 'codejar-prism',
    '--iterations', '1', '--warmups', '0', '--characters', '1', '--lag-samples', '60', '--no-profile',
  ]))
  const trace = JSON.parse(await readFile(join(output, 'profiles/codejar-prism-typing-lag.json'), 'utf8')) as TraceProfile
  const marks = new Map(trace.traceEvents.map((event) => [event.name, event.ts]))
  const gaps = Array.from({ length: 59 }, (_, index) =>
    (marks.get(`typing-lag:${index + 2}:keydown`)! - marks.get(`typing-lag:${index + 1}:settled`)!) / 1_000,
  )
  assert.ok(gaps.every((gap) => gap >= 16), `Expected at least 16 ms idle before the next key; shortest gap: ${Math.min(...gaps)}`)
  assert.ok(Math.max(...gaps) - Math.min(...gaps) >= 30, 'Pauses must vary rather than lock to one refresh phase')
  // The pinned headless Chromium runs at 60 Hz. Use broad bins/tolerances to allow host jitter.
  const phases = gaps.map((gap) => gap % (1_000 / 60))
  const bins = Array.from({ length: 4 }, (_, index) => phases.filter((phase) =>
    phase >= index * 1_000 / 240 && phase < (index + 1) * 1_000 / 240,
  ).length)
  assert.ok(bins.every((count) => count >= 5), `Keystrokes must cover the refresh interval: ${bins.join(', ')}`)
})
