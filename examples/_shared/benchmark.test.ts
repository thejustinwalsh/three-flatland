import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  createBenchmarkSimulationGate,
  isBenchmarkSceneReady,
  rendererGpuAdapterInfo,
  type BenchmarkTarget,
} from './benchmark'
import { benchmarkBuildMetadata, benchmarkFixtureSourceFiles, benchmarkFixtureSourceSha256 } from './benchmark-vite'

const FIXTURE_DIRECTORIES = [
  'examples/three/knightmark',
  'examples/react/knightmark',
  'examples/three/lighting',
  'examples/react/lighting',
] as const

describe('benchmark simulation gate', () => {
  it('requires evidence builds to disable devtools explicitly', () => {
    const previousEvidence = process.env.FL_BENCHMARK_EVIDENCE
    const previousDevtools = process.env.FL_DEVTOOLS
    try {
      process.env.FL_BENCHMARK_EVIDENCE = 'true'
      process.env.FL_DEVTOOLS = 'true'
      expect(() => benchmarkBuildMetadata('build', FIXTURE_DIRECTORIES[0])).toThrow(
        /evidence builds require FL_DEVTOOLS=false/
      )
    } finally {
      if (previousEvidence === undefined) delete process.env.FL_BENCHMARK_EVIDENCE
      else process.env.FL_BENCHMARK_EVIDENCE = previousEvidence
      if (previousDevtools === undefined) delete process.env.FL_DEVTOOLS
      else process.env.FL_DEVTOOLS = previousDevtools
    }
  })

  it('keeps simulation at frame zero until the harness releases it', () => {
    const target: BenchmarkTarget = {}
    const gate = createBenchmarkSimulationGate(true, target)

    expect(gate.frame()).toBe(0)
    expect(target.__THREE_FLATLAND_BENCHMARK_FRAME__).toBe(0)
    expect(gate.advance()).toBe(false)
    expect(gate.frame()).toBe(0)

    target.__THREE_FLATLAND_BENCHMARK_START__?.()

    expect(gate.advance()).toBe(true)
    expect(gate.advance()).toBe(true)
    expect(gate.frame()).toBe(2)
    expect(target.__THREE_FLATLAND_BENCHMARK_FRAME__).toBe(2)

    target.__THREE_FLATLAND_BENCHMARK_PAUSE__?.()
    expect(gate.advance()).toBe(false)
    expect(gate.frame()).toBe(2)
    target.__THREE_FLATLAND_BENCHMARK_START__?.()
    expect(gate.advance()).toBe(true)
    expect(gate.frame()).toBe(3)
  })

  it('does not install automation hooks outside benchmark mode', () => {
    const target: BenchmarkTarget = {}
    const gate = createBenchmarkSimulationGate(false, target)

    expect(gate.advance()).toBe(true)
    expect(gate.frame()).toBe(0)
    expect(target).toEqual({})
  })

  it('waits for a complete sprite, batch, and optional light snapshot', () => {
    expect(isBenchmarkSceneReady({ requestedSprites: 50_000, actualSprites: 0, actualBatches: 0 })).toBe(false)
    expect(isBenchmarkSceneReady({ requestedSprites: 50_000, actualSprites: 50_000, actualBatches: 4 })).toBe(true)
    expect(
      isBenchmarkSceneReady({
        requestedSprites: 40_000,
        actualSprites: 40_000,
        actualBatches: 4,
        requestedLights: 256,
        actualLights: 0,
      })
    ).toBe(false)
    expect(
      isBenchmarkSceneReady({
        requestedSprites: 40_000,
        actualSprites: 40_000,
        actualBatches: 4,
        requestedLights: 256,
        actualLights: 256,
      })
    ).toBe(true)
  })

  it('reads adapter identity from the renderer device instead of requesting another adapter', () => {
    const gpuAdapter = {
      vendor: 'actual-vendor',
      architecture: 'actual-architecture',
      device: 'actual-device',
      description: 'actual-renderer-device',
    }
    expect(rendererGpuAdapterInfo({ backend: { device: { adapterInfo: gpuAdapter } } })).toEqual(gpuAdapter)
    expect(() => rendererGpuAdapterInfo({ backend: { device: {} } })).toThrow(/initialized GPU device adapterInfo/)
    expect(() =>
      rendererGpuAdapterInfo({ backend: { device: { adapterInfo: { ...gpuAdapter, device: undefined } } } })
    ).toThrow(/adapterInfo.device must be a string/)
  })

  it.each(FIXTURE_DIRECTORIES)('hashes every tracked source for %s with the shared harness', (directory) => {
    const fixtureFiles = benchmarkFixtureSourceFiles(directory)
    const trackedExampleFiles = execFileSync('git', ['ls-files', '-z', '--', directory], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)

    expect(fixtureFiles).toEqual(
      [...trackedExampleFiles, 'examples/_shared/benchmark-vite.ts', 'examples/_shared/benchmark.ts'].sort((a, b) =>
        a.localeCompare(b)
      )
    )
    expect(benchmarkFixtureSourceSha256(directory)).toMatch(/^[0-9a-f]{64}$/)
    expect(benchmarkFixtureSourceSha256(directory)).toBe(benchmarkFixtureSourceSha256(directory))
  })
})
