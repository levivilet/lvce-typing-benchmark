import assert from 'node:assert/strict'
import test from 'node:test'
import { computeLayerMetrics } from '../src/paintMetrics.ts'

test('summarizes the final layer tree', () => {
  assert.deepEqual(
    computeLayerMetrics(
      [
        { layerId: 'root', width: 1280, height: 720, drawsContent: false },
        { layerId: 'content-1', width: 100, height: 20, drawsContent: true },
        { layerId: 'content-2', width: 40, height: 10, drawsContent: true },
      ],
      17,
    ),
    {
      contentLayerAreaPixels: 2_400,
      contentLayerCount: 2,
      layerCount: 3,
      paintCommandCount: 17,
    },
  )
})

test('reports missing layer information', () => {
  assert.deepEqual(computeLayerMetrics(undefined, null), {
    contentLayerAreaPixels: null,
    contentLayerCount: null,
    layerCount: null,
    paintCommandCount: null,
  })
})
