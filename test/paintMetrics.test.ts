import assert from 'node:assert/strict'
import test from 'node:test'
import { computeLayerMetrics } from '../src/paintMetrics.ts'

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
