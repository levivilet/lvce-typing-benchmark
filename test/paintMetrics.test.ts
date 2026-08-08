import assert from 'node:assert/strict'
import test from 'node:test'
import type { CDPSession } from 'playwright'
import { computeLayerMetrics, getPaintCommandCount } from '../src/paintMetrics.ts'

test('summarizes the final layer tree', () => {
  assert.deepEqual(
    computeLayerMetrics(
      [
        { layerId: 'root', drawsContent: false },
        { layerId: 'content-1', drawsContent: true },
        { layerId: 'content-2', drawsContent: true },
      ],
      17,
    ),
    {
      contentLayerCount: 2,
      layerCount: 3,
      paintCommandCount: 17,
    },
  )
})

test('reports missing layer information', () => {
  assert.deepEqual(computeLayerMetrics(undefined, null), {
    contentLayerCount: null,
    layerCount: null,
    paintCommandCount: null,
  })
})

test('profiles layers that Chromium accepts and skips contradictory non-drawing layers', async () => {
  const cdp = {
    async send(method: string, parameters?: { readonly layerId?: string }): Promise<unknown> {
      if (method === 'LayerTree.makeSnapshot') {
        if (parameters?.layerId === 'rejected') {
          throw new Error('Protocol error (LayerTree.makeSnapshot): Layer does not draw content')
        }
        if (parameters?.layerId === 'pictureless') {
          throw new Error('Protocol error (LayerTree.makeSnapshot): Layer does not produce picture')
        }
        return { snapshotId: 'snapshot-1' }
      }
      if (method === 'LayerTree.snapshotCommandLog') {
        return { commandLog: [{}, {}, {}] }
      }
      return {}
    },
  } as unknown as CDPSession
  assert.equal(
    await getPaintCommandCount(cdp, [
      { layerId: 'rejected', drawsContent: true },
      { layerId: 'pictureless', drawsContent: true },
      { layerId: 'profiled', drawsContent: true },
    ]),
    3,
  )
})
