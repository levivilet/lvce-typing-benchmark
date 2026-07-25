import assert from 'node:assert/strict'
import test from 'node:test'
import { getJavaScriptDurationMs } from '../src/analyze.ts'
import type { TraceProfile } from '../src/types.ts'

test('sums JavaScript CPU samples and excludes idle samples', () => {
  const profile: TraceProfile = {
    traceEvents: [
      {
        name: 'ProfileChunk',
        pid: 1,
        tid: 2,
        id: '0x1',
        args: {
          data: {
            cpuProfile: {
              nodes: [
                { id: 1, callFrame: { functionName: '(idle)', scriptId: '0', url: '' } },
                { id: 2, callFrame: { functionName: 'onInput', scriptId: '12', url: 'http://localhost/editor.js' } },
              ],
              samples: [1, 2, 2],
            },
            timeDeltas: [1_000, 2_000, 3_000],
          },
        },
      },
    ],
  }
  assert.equal(getJavaScriptDurationMs(profile), 5)
})

test('resolves nodes emitted in a later profile chunk', () => {
  const profile: TraceProfile = {
    traceEvents: [
      {
        name: 'ProfileChunk',
        pid: 1,
        tid: 2,
        id: '0x1',
        args: { data: { cpuProfile: { samples: [2] }, timeDeltas: [4_000] } },
      },
      {
        name: 'ProfileChunk',
        pid: 1,
        tid: 2,
        id: '0x1',
        args: {
          data: {
            cpuProfile: {
              nodes: [{ id: 2, callFrame: { functionName: 'onInput', scriptId: '12', url: 'http://localhost/editor.js' } }],
            },
          },
        },
      },
    ],
  }
  assert.equal(getJavaScriptDurationMs(profile), 4)
})
