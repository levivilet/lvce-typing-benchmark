import type { TraceEvent, TraceProfile } from './types.ts'

export interface TracePaintMetrics {
  readonly largestPaintAreaPixels: number
  readonly paintDurationMs: number
  readonly paintedAreaPixels: number
  readonly paintEventCount: number
}

const getClipArea = (clip: readonly number[] | undefined): number => {
  if (!clip || clip.length < 6 || clip.length % 2 !== 0 || clip.some((value) => !Number.isFinite(value))) {
    return 0
  }
  let twiceArea = 0
  for (let index = 0; index < clip.length; index += 2) {
    const nextIndex = (index + 2) % clip.length
    twiceArea += (clip[index] ?? 0) * (clip[nextIndex + 1] ?? 0)
    twiceArea -= (clip[nextIndex] ?? 0) * (clip[index + 1] ?? 0)
  }
  return Math.abs(twiceArea) / 2
}

const isMainFrameCommit = (event: TraceEvent): boolean => {
  return event.name === 'CommitLoad' && event.args?.data?.isMainFrame === true
}

export const getTracePaintMetrics = ({ traceEvents }: TraceProfile): TracePaintMetrics => {
  const navigationCommit = traceEvents.findLast(isMainFrameCommit)
  if (!navigationCommit) {
    throw new Error('Chromium trace did not contain a main-frame navigation commit')
  }
  const navigationStart = navigationCommit.ts ?? -Infinity
  const mainFrame = navigationCommit?.args?.data?.frame
  const paintEvents = traceEvents.filter(
    (event) =>
      event.name === 'Paint' &&
      event.ph === 'X' &&
      (event.ts ?? -Infinity) >= navigationStart &&
      (!mainFrame || event.args?.data?.frame === mainFrame),
  )
  const paintAreas = paintEvents.map((event) => getClipArea(event.args?.data?.clip))
  return {
    largestPaintAreaPixels: Math.max(0, ...paintAreas),
    paintDurationMs: paintEvents.reduce((total, event) => total + (event.dur ?? 0), 0) / 1_000,
    paintedAreaPixels: paintAreas.reduce((total, area) => total + area, 0),
    paintEventCount: paintEvents.length,
  }
}
