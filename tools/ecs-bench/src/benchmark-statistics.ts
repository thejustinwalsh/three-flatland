export function nearestRankPercentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) throw new RangeError('percentile requires at least one observation')
  if (!(fraction > 0 && fraction <= 1)) throw new RangeError('percentile fraction must be in (0, 1]')
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * fraction) - 1]!
}

export function timingSummary(values: readonly number[]): { median: number; p95: number } {
  return {
    median: nearestRankPercentile(values, 0.5),
    p95: nearestRankPercentile(values, 0.95),
  }
}
