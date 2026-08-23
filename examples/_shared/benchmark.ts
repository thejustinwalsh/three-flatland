export const BENCHMARK_READY_EVENT = 'three-flatland:benchmark-ready'
export const DEFAULT_BENCHMARK_SEED = 0xc0ffee

export interface BenchmarkReadyDetail {
  example: 'knightmark' | 'lighting'
  variant: 'three' | 'react'
  seed: number
  requestedSprites: number
  actualSprites: number
  actualBatches: number
  requestedLights?: number
  actualLights?: number
}

type BenchmarkWindow = Window & {
  __THREE_FLATLAND_BENCHMARK__?: BenchmarkReadyDetail
}

export function benchmarkParams(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

export function integerParam(params: URLSearchParams, name: string, fallback: number): number {
  const value = Number.parseInt(params.get(name) ?? '', 10)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

export function numberParam(params: URLSearchParams, name: string): number | undefined {
  const value = Number.parseFloat(params.get(name) ?? '')
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export function booleanParam(params: URLSearchParams, name: string, fallback: boolean): boolean {
  const value = params.get(name)
  if (value === null) return fallback
  return value !== '0' && value !== 'false'
}

/** Deterministic Mulberry32 stream, isolated from application-global randomness. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** Publish once after the first completed render so automation can reject fixture drift. */
export function publishBenchmarkReady(detail: BenchmarkReadyDetail): void {
  const target = window as BenchmarkWindow
  if (target.__THREE_FLATLAND_BENCHMARK__) return
  target.__THREE_FLATLAND_BENCHMARK__ = detail
  window.dispatchEvent(new CustomEvent(BENCHMARK_READY_EVENT, { detail }))
}
