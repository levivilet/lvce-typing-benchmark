import type { CDPSession } from 'playwright'

interface CompositedLayer {
  readonly drawsContent: boolean
  readonly layerId: string
}

export interface LayerMetrics {
  readonly contentLayerCount: number | null
  readonly layerCount: number | null
  readonly paintCommandCount: number | null
}

export const computeLayerMetrics = (
  layers: readonly CompositedLayer[] | undefined,
  paintCommandCount: number | null,
): LayerMetrics => {
  const contentLayers = layers?.filter((layer) => layer.drawsContent)
  return {
    contentLayerCount: contentLayers?.length ?? null,
    layerCount: layers?.length ?? null,
    paintCommandCount,
  }
}

export class LayerMetricsCollector {
  private readonly cdp: CDPSession
  private layers: readonly CompositedLayer[] | undefined
  private navigationSetup = Promise.resolve()

  constructor(cdp: CDPSession) {
    this.cdp = cdp
    cdp.on('Page.frameNavigated', ({ frame }: { readonly frame: { readonly parentId?: string } }) => {
      if (!frame.parentId) {
        this.navigationSetup = this.enableForDocument()
      }
    })
    cdp.on('LayerTree.layerTreeDidChange', ({ layers }: { readonly layers?: readonly CompositedLayer[] }) => {
      if (layers) {
        this.layers = layers
      }
    })
  }

  private async enableForDocument(): Promise<void> {
    await this.cdp.send('DOM.getDocument')
    await this.cdp.send('LayerTree.enable')
  }

  async start(): Promise<void> {
    await Promise.all([this.cdp.send('DOM.enable'), this.cdp.send('Page.enable')])
    await this.enableForDocument()
    this.layers = undefined
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.cdp.send('DOM.disable'),
      this.cdp.send('LayerTree.disable'),
      this.cdp.send('Page.disable'),
    ])
  }

  async collect(): Promise<LayerMetrics> {
    await this.enableForDocument()
    await this.navigationSetup
    const { layers } = this
    const paintCommandCount = layers ? await getPaintCommandCount(this.cdp, layers) : null
    return computeLayerMetrics(layers, paintCommandCount)
  }
}

const getPaintCommandCount = async (
  cdp: CDPSession,
  layers: readonly CompositedLayer[],
): Promise<number | null> => {
  let paintCommandCount = 0
  const contentLayers = layers.filter((layer) => layer.drawsContent)
  for (const layer of contentLayers) {
    let snapshotId: string | undefined
    try {
      const { snapshotId: createdSnapshotId } = await cdp.send('LayerTree.makeSnapshot', { layerId: layer.layerId })
      snapshotId = createdSnapshotId
      const { commandLog } = await cdp.send('LayerTree.snapshotCommandLog', { snapshotId })
      paintCommandCount += commandLog.length
    } catch {
      return null
    } finally {
      if (snapshotId) {
        await cdp.send('LayerTree.releaseSnapshot', { snapshotId }).catch(() => undefined)
      }
    }
  }
  return contentLayers.length === 0 ? null : paintCommandCount
}
