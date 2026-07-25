import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeCpuBreakdown } from '../src/cpuBreakdown.ts'
import type { TraceProfile } from '../src/types.ts'

const createWorkerTrace = (): TraceProfile => ({
  traceEvents: [
    { name: 'Profile', pid: 1, tid: 20, id: '0x2' },
    {
      name: 'ProfileChunk',
      pid: 1,
      tid: 88,
      id: '0x2',
      args: {
        data: {
          cpuProfile: {
            nodes: [
              {
                id: 1,
                callFrame: {
                  functionName: 'type',
                  scriptId: '2',
                  url: 'http://localhost/packages/editor-worker/dist/editorWorkerMain.js',
                },
              },
            ],
            samples: [1],
          },
          timeDeltas: [4_000],
        },
      },
    },
  ],
})

test('attributes self and inclusive time to LVCE functions and execution contexts', () => {
  const trace: TraceProfile = {
    traceEvents: [
      {
        name: 'Profile',
        pid: 1,
        tid: 10,
        id: '0x1',
      },
      {
        name: 'thread_name',
        pid: 1,
        tid: 10,
        args: { name: 'CrRendererMain' },
      },
      {
        name: 'ProfileChunk',
        pid: 1,
        tid: 99,
        id: '0x1',
        args: {
          data: {
            cpuProfile: {
              nodes: [
                {
                  id: 1,
                  callFrame: { functionName: '(root)', scriptId: '0', url: '' },
                },
                {
                  id: 2,
                  parent: 1,
                  callFrame: {
                    functionName: 'handleKeyDown',
                    scriptId: '1',
                    url: 'http://localhost/packages/renderer-process/dist/rendererProcessMain.js',
                  },
                },
                {
                  id: 3,
                  parent: 2,
                  callFrame: {
                    functionName: 'setText',
                    scriptId: '1',
                    url: 'http://localhost/packages/renderer-process/dist/rendererProcessMain.js',
                  },
                },
              ],
              samples: [3, 3, 3],
            },
            timeDeltas: [2_000, 3_000, -9_000],
          },
        },
      },
    ],
  }

  const result = analyzeCpuBreakdown([trace])

  assert.equal(result.iterations, 1)
  assert.equal(result.lvceJavaScriptMs, 5)
  assert.deepEqual(result.contexts, [
    {
      functionCount: 2,
      kind: 'main',
      name: 'Renderer process',
      selfMs: 5,
      share: 100,
    },
  ])
  assert.deepEqual(result.hotspots, [
    {
      columnNumber: 0,
      context: 'Renderer process',
      functionName: 'setText',
      inclusiveMs: 5,
      lineNumber: 0,
      samples: 2,
      selfMs: 5,
      share: 100,
      source: 'rendererProcessMain.js',
    },
    {
      columnNumber: 0,
      context: 'Renderer process',
      functionName: 'handleKeyDown',
      inclusiveMs: 5,
      lineNumber: 0,
      samples: 0,
      selfMs: 0,
      share: 0,
      source: 'rendererProcessMain.js',
    },
  ])
})

test('averages CPU time across iterations and keeps worker profiles separate', () => {
  const result = analyzeCpuBreakdown([createWorkerTrace(), createWorkerTrace()])

  assert.equal(result.iterations, 2)
  assert.equal(result.lvceJavaScriptMs, 4)
  assert.equal(result.contexts[0]?.kind, 'worker')
  assert.equal(result.contexts[0]?.name, 'Editor worker')
  assert.equal(result.hotspots[0]?.selfMs, 4)
  assert.equal(result.hotspots[0]?.samples, 1)
})
