export const BENCHMARK_READY_EVENT = 'three-flatland:benchmark-ready'
export const DEFAULT_BENCHMARK_SEED = 0xc0ffee

export interface BenchmarkGpuAdapterInfo {
  vendor: string
  architecture: string
  device: string
  description: string
}

export interface BenchmarkReadyDetail {
  example: 'knightmark' | 'lighting'
  variant: 'three' | 'react'
  seed: number
  fixedDeltaMs: number | null
  requestedSprites: number
  actualSprites: number
  actualBatches: number
  simulationGated: boolean
  simulationFrame: number
  buildRevision: string
  fixtureSourceSha256: string
  buildDevtoolsEnabled: boolean
  buildProfileEnabled: boolean
  gpuAdapter: BenchmarkGpuAdapterInfo
  collisionsEnabled?: boolean
  requestedLights?: number
  actualLights?: number
}

export interface BenchmarkTarget {
  __THREE_FLATLAND_BENCHMARK__?: BenchmarkReadyDetail
  __THREE_FLATLAND_BENCHMARK_START__?: () => void
  __THREE_FLATLAND_BENCHMARK_PAUSE__?: () => void
  __THREE_FLATLAND_BENCHMARK_FRAME__?: number
}

type BenchmarkWindow = Window & BenchmarkTarget

/** Read the adapter identity from the GPU device used by the initialized renderer. */
export function rendererGpuAdapterInfo(renderer: unknown): BenchmarkGpuAdapterInfo {
  const info = (
    renderer as {
      backend?: {
        device?: {
          adapterInfo?: unknown
        }
      }
    }
  ).backend?.device?.adapterInfo
  if (typeof info !== 'object' || info === null) {
    throw new Error('Benchmark renderer did not expose its initialized GPU device adapterInfo')
  }

  const candidate = info as Partial<BenchmarkGpuAdapterInfo>
  for (const field of ['vendor', 'architecture', 'device', 'description'] as const) {
    if (typeof candidate[field] !== 'string') {
      throw new TypeError(`Benchmark renderer GPU adapterInfo.${field} must be a string`)
    }
  }
  return {
    vendor: candidate.vendor!,
    architecture: candidate.architecture!,
    device: candidate.device!,
    description: candidate.description!,
  }
}

/**
 * Keep benchmark simulation at frame zero until automation explicitly starts
 * the warmup. Rendering and batching continue, so readiness can be validated
 * without letting asynchronous page startup advance a seeded workload by an
 * target-dependent number of frames.
 */
export function createBenchmarkSimulationGate(
  enabled: boolean,
  target: BenchmarkTarget = window as BenchmarkWindow
): {
  advance(): boolean
  frame(): number
} {
  if (!enabled) return { advance: () => true, frame: () => 0 }

  let started = false
  let frame = 0
  target.__THREE_FLATLAND_BENCHMARK_FRAME__ = 0
  target.__THREE_FLATLAND_BENCHMARK_START__ = () => {
    started = true
  }
  target.__THREE_FLATLAND_BENCHMARK_PAUSE__ = () => {
    started = false
  }
  return {
    advance(): boolean {
      if (!started) return false
      frame++
      target.__THREE_FLATLAND_BENCHMARK_FRAME__ = frame
      return true
    },
    frame: () => frame,
  }
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
export function publishBenchmarkReady(
  detail: Omit<
    BenchmarkReadyDetail,
    'buildRevision' | 'fixtureSourceSha256' | 'buildDevtoolsEnabled' | 'buildProfileEnabled'
  >
): void {
  const target = window as BenchmarkWindow
  if (target.__THREE_FLATLAND_BENCHMARK__) return
  const published = {
    ...detail,
    buildRevision: import.meta.env.VITE_FLATLAND_BENCHMARK_REVISION ?? 'development',
    fixtureSourceSha256: import.meta.env.VITE_FLATLAND_BENCHMARK_FIXTURE_SHA256 ?? 'development',
    buildDevtoolsEnabled: import.meta.env.VITE_FLATLAND_BENCHMARK_DEVTOOLS === 'true',
    buildProfileEnabled: import.meta.env.VITE_FLATLAND_BENCHMARK_PROFILE === 'true',
  }
  target.__THREE_FLATLAND_BENCHMARK__ = published
  window.dispatchEvent(new CustomEvent(BENCHMARK_READY_EVENT, { detail: published }))
}
