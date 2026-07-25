import type { Stats } from './types.ts'

export const computeStats = (values: readonly number[]): Stats => {
  const finite = values.filter(Number.isFinite).toSorted((a, b) => a - b)
  if (finite.length === 0) {
    return { mean: null, min: null, max: null, p95: null }
  }
  const p95Index = Math.min(finite.length - 1, Math.ceil(finite.length * 0.95) - 1)
  return {
    mean: finite.reduce((total, value) => total + value, 0) / finite.length,
    min: finite[0] ?? null,
    max: finite.at(-1) ?? null,
    p95: finite[p95Index] ?? null,
  }
}
