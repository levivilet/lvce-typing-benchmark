import type { CDPSession } from 'playwright'
import type { PaintCommandCount } from './renderTypes.ts'

interface CompositedLayer {
  readonly drawsContent: boolean
  readonly layerId: string
}

export interface LayerMetrics {
  readonly contentLayerCount: number | null
  readonly layerCount: number | null
  readonly paintCommandCount: number | null
  readonly paintCommands: readonly PaintCommandCount[] | null
}

export const computeLayerMetrics = (
  layers: readonly CompositedLayer[] | undefined,
  paintCommands: readonly PaintCommandCount[] | null,
): LayerMetrics => {
  const contentLayers = layers?.filter((layer) => layer.drawsContent)
  return {
    contentLayerCount: contentLayers?.length ?? null,
    layerCount: layers?.length ?? null,
    paintCommandCount: paintCommands?.reduce((total, command) => total + command.count, 0) ?? null,
    paintCommands,
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
    const paintCommands = layers ? await getPaintCommands(this.cdp, layers) : null
    return computeLayerMetrics(layers, paintCommands)
  }
}

export const getPaintCommands = async (
  cdp: CDPSession,
  layers: readonly CompositedLayer[],
): Promise<readonly PaintCommandCount[] | null> => {
  const commandCounts = new Map<string, number>()
  let profiledLayerCount = 0
  const contentLayers = layers.filter((layer) => layer.drawsContent)
  for (const layer of contentLayers) {
    let snapshotId: string | undefined
    try {
      const { snapshotId: createdSnapshotId } = await cdp.send('LayerTree.makeSnapshot', { layerId: layer.layerId })
      snapshotId = createdSnapshotId
      const { commandLog } = await cdp.send('LayerTree.snapshotCommandLog', { snapshotId })
      for (const command of commandLog) {
        const method = command.method || 'unknown'
        commandCounts.set(method, (commandCounts.get(method) || 0) + 1)
      }
      profiledLayerCount++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('Layer does not draw content') || message.includes('Layer does not produce picture')) {
        continue
      }
      console.info(`Paint Profiler snapshot unavailable for layer ${layer.layerId}: ${message}`)
      return null
    } finally {
      if (snapshotId) {
        await cdp.send('LayerTree.releaseSnapshot', { snapshotId }).catch(() => undefined)
      }
    }
  }
  if (profiledLayerCount === 0) {
    return null
  }
  return Array.from(commandCounts, ([method, count]) => ({ count, method })).toSorted(
    (a, b) => b.count - a.count || a.method.localeCompare(b.method),
  )
}
