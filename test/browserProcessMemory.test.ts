import assert from 'node:assert/strict'
import test from 'node:test'
import { getBrowserProcessMemory } from '../src/browserProcessMemory.ts'

test('reads renderer and GPU resident memory on Linux', async () => {
  const memory = await getBrowserProcessMemory(
    [
      { id: 10, type: 'renderer' },
      { id: 11, type: 'Renderer' },
      { id: 20, type: 'GPU' },
    ],
    async (pid) => `Name:\tchromium\nVmRSS:\t${pid} kB\n`,
    'linux',
  )
  assert.deepEqual(memory, {
    gpuBytes: 20 * 1024,
    rendererBytes: 21 * 1024,
  })
})

test('returns unavailable memory on non-Linux platforms', async () => {
  assert.deepEqual(await getBrowserProcessMemory([{ id: 20, type: 'GPU' }], async () => '', 'darwin'), {
    gpuBytes: null,
    rendererBytes: null,
  })
})
