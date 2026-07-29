import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { analyzeStartupResults, analyzeStartupTrace } from '../src/startupAnalyze.ts'
import type { TraceProfile } from '../src/types.ts'

const trace: TraceProfile = {
  traceEvents: [
    {
      args: {
        data: {
          cpuProfile: {
            nodes: [
              {
                callFrame: { functionName: '(root)', scriptId: '0' },
                id: 1,
              },
              {
                callFrame: { functionName: 'startWorkbench', scriptId: '1' },
                id: 2,
              },
            ],
            samples: [2],
          },
          timeDeltas: [10_000],
        },
      },
      id: 'main',
      name: 'ProfileChunk',
      pid: 1,
      tid: 1,
    },
    { dur: 10_000, name: 'v8.compileModule', pid: 1, tid: 1, ts: 0 },
    { dur: 10_000, name: 'v8.compileModule', pid: 1, tid: 1, ts: 5_000 },
    { dur: 5_000, name: 'v8.parseOnBackgroundParsing', pid: 1, tid: 2, ts: 0 },
    { dur: 3_000, name: 'V8.DeserializeContext', pid: 1, tid: 1, ts: 20_000 },
    { dur: 4_000, name: 'CpuProfiler::StartProfiling', pid: 1, tid: 1, ts: 24_000 },
    { dur: 2_000, name: 'MinorGC', pid: 1, tid: 1, ts: 29_000 },
    { dur: 5_000, name: 'Layout', pid: 1, tid: 1, ts: 32_000 },
    { dur: 1_000, name: 'HandlePostMessage', pid: 1, tid: 1, ts: 38_000 },
    {
      args: { name: 'DedicatedWorker thread' },
      name: 'thread_name',
      ph: 'M',
      pid: 1,
      tid: 2,
    },
    {
      args: { name: 'DedicatedWorker thread' },
      name: 'thread_name',
      ph: 'M',
      pid: 1,
      tid: 2,
    },
    {
      args: { data: { requestId: 'script', resourceType: 'Script' } },
      name: 'ResourceSendRequest',
      ts: 1_000,
    },
    {
      args: { data: { decodedBodyLength: 2_000_000, requestId: 'script' } },
      name: 'ResourceFinish',
      ts: 5_000,
    },
    {
      args: { data: { requestId: 'style', resourceType: 'Stylesheet' } },
      name: 'ResourceSendRequest',
      ts: 2_000,
    },
    {
      args: { data: { decodedBodyLength: 500_000, requestId: 'style' } },
      name: 'ResourceFinish',
      ts: 3_000,
    },
  ],
}

test('attributes startup trace work without double-counting nested thread intervals', () => {
  const metrics = analyzeStartupTrace(trace)
  assert.equal(metrics.compileParseMs, 20)
  assert.equal(metrics.compiledModuleCount, 2)
  assert.equal(metrics.dedicatedWorkerThreadCount, 1)
  assert.equal(metrics.garbageCollectionMs, 2)
  assert.equal(metrics.largestScriptBytes, 2_000_000)
  assert.equal(metrics.largestScriptTransferMs, 4)
  assert.equal(metrics.messageHandlingMs, 1)
  assert.equal(metrics.profilerStartCount, 1)
  assert.equal(metrics.profilerStartupMs, 4)
  assert.equal(metrics.renderMs, 5)
  assert.equal(metrics.requestCount, 2)
  assert.equal(metrics.totalResourceBytes, 2_500_000)
  assert.equal(metrics.v8InitializationMs, 3)
})

test('writes startup attribution statistics to the benchmark summary', async () => {
  const input = await mkdtemp(join(tmpdir(), 'startup-analyze-'))
  await mkdir(join(input, 'profiles'))
  await writeFile(
    join(input, 'benchmark.json'),
    JSON.stringify({
      ides: [
        {
          id: 'lvce-editor',
          kind: 'lvce',
          label: 'LVCE Editor',
          path: '/',
          version: '1.0.0',
        },
      ],
    }),
  )
  await writeFile(
    join(input, 'iterations.json'),
    JSON.stringify([
      {
        domContentLoadedMs: 40,
        ide: 'lvce-editor',
        iteration: 1,
        profilePath: 'profiles/lvce-editor-1.json',
        startupDurationMs: 100,
        success: true,
        warmup: false,
      },
    ]),
  )
  await writeFile(join(input, 'profiles', 'lvce-editor-1.json'), JSON.stringify(trace))

  const summary = await analyzeStartupResults(input)
  const writtenSummary = JSON.parse(await readFile(join(input, 'summary.json'), 'utf8'))
  const ide = summary.ides[0]

  assert.equal(ide?.javascriptDurationMs.mean, 10)
  assert.equal(ide?.traceBreakdown.compileParseMs.mean, 20)
  assert.equal(ide?.traceBreakdown.postDomContentLoadedMs.mean, 60)
  assert.deepEqual(writtenSummary, summary)
})
