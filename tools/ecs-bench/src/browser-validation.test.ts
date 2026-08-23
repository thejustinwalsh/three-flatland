import { describe, expect, it } from 'vitest'
import {
  LATE_RAF_THRESHOLD_MS,
  SIXTY_HZ_FRAME_BUDGET_MS,
  assertNoUnexpectedDiagnostics,
  browserCaptureFailure,
  dependencyCatalogResolution,
  expectedFixtureBatches,
  expectedEcsProfileMarkers,
  frameRateSummary,
  longTaskDurations,
  lateRafCallbackCount,
  parseBenchmarkTarget,
  parseNonnegativeIntegerArgument,
  validateBenchmarkTargets,
  validateBrowserRunShape,
  validateEcsMarkers,
  validateFixtureReadiness,
  validateFixtureSourceParity,
  validateGpuAdapterParity,
  validateSimulationFrames,
  withBrowserFailureRecord,
  withCleanupPreservingFirstError,
  type BrowserReadiness,
} from './browser-validation'

const HEAD_REVISION = '1234567890abcdef1234567890abcdef12345678'
const FIXTURE_SOURCE_SHA256 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const GPU_ADAPTER = {
  vendor: 'Example Vendor',
  architecture: 'Example Architecture',
  device: 'Example Device',
  description: 'Example Adapter',
}

function readiness(overrides: Partial<BrowserReadiness> = {}): BrowserReadiness {
  return {
    example: 'knightmark',
    variant: 'react',
    seed: 0xc0ffee,
    fixedDeltaMs: 16.6667,
    collisionsEnabled: false,
    requestedSprites: 40_000,
    actualSprites: 40_000,
    actualBatches: 3,
    simulationGated: true,
    simulationFrame: 0,
    buildRevision: HEAD_REVISION,
    fixtureSourceSha256: FIXTURE_SOURCE_SHA256,
    buildDevtoolsEnabled: false,
    buildProfileEnabled: false,
    gpuAdapter: GPU_ADAPTER,
    ...overrides,
  }
}

describe('browser benchmark validation', () => {
  it('pins RAF callback cadence to an explicit 16.667 ms budget', () => {
    expect(SIXTY_HZ_FRAME_BUDGET_MS).toBe(16.667)
    expect(LATE_RAF_THRESHOLD_MS).toBeCloseTo(25.0005)
    expect(lateRafCallbackCount([8.333, 16.667, 25.0005, 25.001])).toBe(1)
  })

  it('reports the slow FPS tail as p05 rather than the fast p95 tail', () => {
    const summary = frameRateSummary([10, 10, 10, 10, 50])
    expect(summary.median).toBe(100)
    expect(summary.p05).toBe(20)
    expect(summary.max).toBe(100)
  })

  it('requires the exact committed batch count for Knightmark', () => {
    expect(expectedFixtureBatches('knightmark', 40_000)).toBe(3)
    expect(() =>
      validateFixtureReadiness(readiness({ actualBatches: 0 }), {
        example: 'knightmark',
        variant: 'react',
        seed: 0xc0ffee,
        collisions: false,
        fixedDeltaMs: 16.6667,
        revision: HEAD_REVISION,
        sprites: 40_000,
        lights: 0,
      })
    ).toThrow(/3 batches/)
    expect(() =>
      validateFixtureReadiness(readiness({ actualBatches: 2 }), {
        example: 'knightmark',
        variant: 'react',
        seed: 0xc0ffee,
        collisions: false,
        fixedDeltaMs: 16.6667,
        revision: HEAD_REVISION,
        sprites: 40_000,
        lights: 0,
      })
    ).toThrow(/3 batches/)
    expect(() =>
      validateFixtureReadiness(readiness(), {
        example: 'knightmark',
        variant: 'react',
        seed: 0xc0ffee,
        collisions: false,
        fixedDeltaMs: 16.6667,
        revision: HEAD_REVISION,
        sprites: 40_000,
        lights: 0,
      })
    ).not.toThrow()
  })

  it('rejects devtools or profile build-flag drift', () => {
    const expected = {
      example: 'knightmark' as const,
      variant: 'react' as const,
      seed: 0xc0ffee,
      collisions: false,
      fixedDeltaMs: 16.6667,
      profile: false,
      revision: HEAD_REVISION,
      sprites: 40_000,
      lights: 0,
    }
    expect(() => validateFixtureReadiness(readiness({ buildDevtoolsEnabled: true }), expected)).toThrow(
      /Fixture mismatch/
    )
    expect(() => validateFixtureReadiness(readiness({ buildProfileEnabled: true }), expected)).toThrow(
      /Fixture mismatch/
    )
    expect(() =>
      validateFixtureReadiness(readiness({ buildProfileEnabled: true }), { ...expected, profile: true })
    ).not.toThrow()
  })

  it('rejects readiness without usable identity from the initialized renderer device', () => {
    expect(() =>
      validateFixtureReadiness(
        readiness({ gpuAdapter: { vendor: '', architecture: '', device: '', description: '' } }),
        {
          example: 'knightmark',
          variant: 'react',
          seed: 0xc0ffee,
          collisions: false,
          fixedDeltaMs: 16.6667,
          revision: HEAD_REVISION,
          sprites: 40_000,
          lights: 0,
        }
      )
    ).toThrow(/has no stable identifying fields/)
  })

  it('accounts for the separate hero run in the lighting fixture', () => {
    expect(expectedFixtureBatches('lighting', 40_000)).toBe(4)
    expect(() =>
      validateFixtureReadiness(
        readiness({
          example: 'lighting',
          variant: 'three',
          actualBatches: 4,
          requestedLights: 8,
          actualLights: 8,
        }),
        {
          example: 'lighting',
          variant: 'three',
          seed: 0xc0ffee,
          collisions: false,
          fixedDeltaMs: 16.6667,
          revision: HEAD_REVISION,
          sprites: 40_000,
          lights: 8,
        }
      )
    ).not.toThrow()
  })

  it.each([
    ['seed', { seed: 123 }],
    ['fixed timestep', { fixedDeltaMs: null }],
    ['collision mode', { collisionsEnabled: true }],
    ['build revision', { buildRevision: 'abcdef1234567890abcdef1234567890abcdef12' }],
  ] as const)('rejects a mismatched %s control', (_name, override) => {
    expect(() =>
      validateFixtureReadiness(readiness(override), {
        example: 'knightmark',
        variant: 'react',
        seed: 0xc0ffee,
        collisions: false,
        fixedDeltaMs: 16.6667,
        revision: HEAD_REVISION,
        sprites: 40_000,
        lights: 0,
      })
    ).toThrow(/mismatch/i)
  })

  it.each([
    ['missing simulation gate', { simulationGated: false }],
    ['advanced startup simulation', { simulationFrame: 1 }],
  ] as const)('rejects %s', (_name, override) => {
    expect(() =>
      validateFixtureReadiness(readiness(override), {
        example: 'knightmark',
        variant: 'react',
        seed: 0xc0ffee,
        collisions: false,
        fixedDeltaMs: 16.6667,
        revision: HEAD_REVISION,
        sprites: 40_000,
        lights: 0,
      })
    ).toThrow(/simulation paused at frame 0/)
  })

  it('filters observer records to the measured window by start time', () => {
    expect(
      longTaskDurations(
        [
          { startTime: 99, duration: 70 },
          { startTime: 100, duration: 51 },
          { startTime: 149, duration: 60 },
          { startTime: 150, duration: 80 },
        ],
        100,
        150
      )
    ).toEqual([51, 60])
  })

  it('preserves diagnostics and target context for failed captures', () => {
    const diagnostic = {
      kind: 'crash' as const,
      level: 'error' as const,
      text: 'Page crashed',
      url: 'http://127.0.0.1:4174/?bench=1',
    }
    expect(
      browserCaptureFailure(new Error('page.evaluate: Target crashed'), [diagnostic], {
        target: 'head',
        revision: HEAD_REVISION,
        count: 40_000,
        phase: 'observation',
        sample: 2,
        order: 1,
        url: diagnostic.url,
      })
    ).toEqual({
      target: 'head',
      revision: HEAD_REVISION,
      count: 40_000,
      phase: 'observation',
      sample: 2,
      order: 1,
      url: diagnostic.url,
      message: 'page.evaluate: Target crashed',
      diagnostics: [diagnostic],
    })
  })

  it('records post-capture validation failures before rethrowing them', async () => {
    const failures: ReturnType<typeof browserCaptureFailure>[] = []
    await expect(
      withBrowserFailureRecord(
        async () => {
          throw new Error('Profile capture is missing the ecs:run marker')
        },
        {
          target: 'head',
          revision: HEAD_REVISION,
          count: 40_000,
          phase: 'observation',
          sample: 1,
          order: 0,
          url: 'http://127.0.0.1:4174/?bench=1',
        },
        () => [],
        (failure) => failures.push(failure)
      )
    ).rejects.toThrow('missing the ecs:run marker')
    expect(failures).toMatchObject([
      {
        target: 'head',
        count: 40_000,
        phase: 'observation',
        sample: 1,
        message: 'Profile capture is missing the ecs:run marker',
      },
    ])
  })

  it('preserves a capture failure when browser cleanup also fails', async () => {
    const captureError = new Error('page.evaluate: Target crashed')
    await expect(
      withCleanupPreservingFirstError(
        async () => {
          throw captureError
        },
        async () => {
          throw new Error('browser.close: disconnected')
        }
      )
    ).rejects.toBe(captureError)
  })

  it('reports browser cleanup failure when the capture succeeded', async () => {
    await expect(
      withCleanupPreservingFirstError(
        async () => 'captured',
        async () => {
          throw new Error('browser.close: disconnected')
        }
      )
    ).rejects.toThrow('browser.close: disconnected')
  })

  it('requires each target to carry a full 40-character Git revision', () => {
    expect(parseBenchmarkTarget(`head=http://127.0.0.1:4174@${HEAD_REVISION}`)).toEqual({
      label: 'head',
      url: 'http://127.0.0.1:4174',
      revision: HEAD_REVISION,
    })
    expect(() => parseBenchmarkTarget('base=http://127.0.0.1:4173')).toThrow(/missing its full Git revision/)
    expect(() => parseBenchmarkTarget('base=http://127.0.0.1:4173@1234567')).toThrow(/full 40-character/)
    expect(() => parseBenchmarkTarget(`base=http://127.0.0.1:4173@${'z'.repeat(40)}`)).toThrow(/full 40-character/)
  })

  it('rejects empty or duplicate target identities before capture', () => {
    const base = parseBenchmarkTarget(`base=http://127.0.0.1:4173@${HEAD_REVISION}`)
    const head = parseBenchmarkTarget(`head=http://127.0.0.1:4174@${HEAD_REVISION}`)
    expect(() => validateBenchmarkTargets([base, head])).not.toThrow()
    expect(() => parseBenchmarkTarget(` =http://127.0.0.1:4173@${HEAD_REVISION}`)).toThrow(/label must not be empty/)
    expect(() => validateBenchmarkTargets([base, { ...head, label: 'base' }])).toThrow(/Duplicate.*label/)
    expect(() => validateBenchmarkTargets([base, { ...head, url: 'http://127.0.0.1:4173/' }])).toThrow(/Duplicate.*URL/)
  })

  it('requires source-identical base and head fixtures', () => {
    expect(
      validateFixtureSourceParity([
        { label: 'base', fixtureSourceSha256: FIXTURE_SOURCE_SHA256 },
        { label: 'head', fixtureSourceSha256: FIXTURE_SOURCE_SHA256 },
      ])
    ).toBe(FIXTURE_SOURCE_SHA256)
    expect(() =>
      validateFixtureSourceParity([
        { label: 'base', fixtureSourceSha256: FIXTURE_SOURCE_SHA256 },
        { label: 'head', fixtureSourceSha256: 'f'.repeat(64) },
      ])
    ).toThrow(/Fixture source mismatch/)
    expect(() => validateFixtureSourceParity([{ label: 'base', fixtureSourceSha256: 'development' }])).toThrow(
      /Invalid fixture source SHA-256/
    )
  })

  it('requires every capture to report a GPU adapter identity', () => {
    expect(() => validateGpuAdapterParity([{ label: 'base control', gpuAdapter: null }])).toThrow(
      /Missing GPU adapter identity for base control/
    )
  })

  it('rejects all-empty or whitespace-only redacted GPU adapter info', () => {
    expect(() =>
      validateGpuAdapterParity([
        {
          label: 'base control',
          gpuAdapter: { vendor: '', architecture: '  ', device: '', description: '\t' },
        },
      ])
    ).toThrow(/no stable identifying fields/)
  })

  it.each([
    ['undefined identity', undefined, /Missing GPU adapter identity/],
    ['non-object identity', 'gpu', /expected an object/],
    ['missing field', { vendor: 'Vendor', architecture: 'Arch', description: 'Adapter' }, /device must be a string/],
    [
      'non-string field',
      { vendor: 'Vendor', architecture: 'Arch', device: 123, description: 'Adapter' },
      /device must be a string/,
    ],
  ] as const)('rejects malformed GPU adapter info: %s', (_name, gpuAdapter, message) => {
    expect(() => validateGpuAdapterParity([{ label: 'base control', gpuAdapter }])).toThrow(message)
  })

  it('normalizes adapter fields before accepting parity', () => {
    expect(
      validateGpuAdapterParity([
        { label: 'base control', gpuAdapter: GPU_ADAPTER },
        {
          label: 'head control',
          gpuAdapter: {
            vendor: ` ${GPU_ADAPTER.vendor} `,
            architecture: ` ${GPU_ADAPTER.architecture}\t`,
            device: `\n${GPU_ADAPTER.device}`,
            description: `${GPU_ADAPTER.description} `,
          },
        },
      ])
    ).toEqual(GPU_ADAPTER)
  })

  it('rejects different GPU adapters across base and head controls', () => {
    expect(() =>
      validateGpuAdapterParity([
        { label: 'base control', gpuAdapter: GPU_ADAPTER },
        { label: 'head control', gpuAdapter: { ...GPU_ADAPTER, device: 'Different Device' } },
      ])
    ).toThrow(/GPU adapter mismatch.*base control.*head control/)
  })

  it('rejects a later observation whose GPU adapter drifts from the accepted control', () => {
    const accepted = validateGpuAdapterParity([
      { label: 'base control', gpuAdapter: GPU_ADAPTER },
      { label: 'head control', gpuAdapter: { ...GPU_ADAPTER } },
    ])
    expect(() =>
      validateGpuAdapterParity(
        [{ label: 'head count 40000 sample 2', gpuAdapter: { ...GPU_ADAPTER, architecture: 'Drifted' } }],
        accepted
      )
    ).toThrow(/GPU adapter mismatch.*expected GPU adapter.*head count 40000 sample 2/)
  })

  it('requires positive, non-empty, unique browser-run counts and frame controls', () => {
    const valid = { counts: [1_000, 40_000], control: 1_000, samples: 3, warmupFrames: 180, sampleFrames: 600 }
    expect(() => validateBrowserRunShape(valid)).not.toThrow()
    for (const name of ['control', 'samples', 'warmupFrames', 'sampleFrames'] as const) {
      expect(() => validateBrowserRunShape({ ...valid, [name]: 0 })).toThrow(/positive integer/)
    }
    expect(() => validateBrowserRunShape({ ...valid, counts: [] })).toThrow(/at least one/)
    expect(() => validateBrowserRunShape({ ...valid, counts: [0] })).toThrow(/positive integers/)
    expect(() => validateBrowserRunShape({ ...valid, counts: [1_000, 1_000] })).toThrow(/duplicate value/)
  })

  it('parses CLI integers without truncating decimals or trailing text', () => {
    expect(parseNonnegativeIntegerArgument(undefined, 3, 'samples')).toBe(3)
    expect(parseNonnegativeIntegerArgument('0', 3, 'lights')).toBe(0)
    expect(parseNonnegativeIntegerArgument('12', 3, 'samples')).toBe(12)
    expect(() => parseNonnegativeIntegerArgument('1.5', 3, 'samples')).toThrow(/expected an integer/)
    expect(() => parseNonnegativeIntegerArgument('12frames', 3, 'frames')).toThrow(/expected an integer/)
    expect(() => parseNonnegativeIntegerArgument('-1', 3, 'lights')).toThrow(/expected an integer/)
  })

  it('distinguishes catalog specifiers from exact lockfile resolutions', () => {
    const workspace = "catalog:\n  '@react-three/fiber': 10.0.0-alpha.3\n  three: ^0.185.1\n"
    const lock =
      "catalogs:\n  default:\n    '@react-three/fiber':\n" +
      '      specifier: 10.0.0-alpha.3\n' +
      '      version: 10.0.0-alpha.3\n' +
      '    three:\n' +
      '      specifier: ^0.185.1\n' +
      '      version: 0.185.1\n'
    expect(dependencyCatalogResolution(workspace, lock, 'three')).toEqual({
      catalogSpecifier: '^0.185.1',
      resolvedVersion: '0.185.1',
    })
    expect(dependencyCatalogResolution(workspace, lock, '@react-three/fiber')).toEqual({
      catalogSpecifier: '10.0.0-alpha.3',
      resolvedVersion: '10.0.0-alpha.3',
    })
    expect(() => dependencyCatalogResolution(workspace, lock.replace('^0.185.1', '^0.186.0'), 'three')).toThrow(
      /specifier mismatch/
    )
  })

  it('requires the gated simulation to advance through the measured RAF window', () => {
    expect(() => validateSimulationFrames({ afterWarmup: 181, afterSample: 782, sampled: 601 }, 180, 600)).not.toThrow()
    expect(() => validateSimulationFrames({ afterWarmup: 0, afterSample: 0, sampled: 0 }, 180, 600)).toThrow(
      /did not advance/
    )
    expect(() => validateSimulationFrames({ afterWarmup: 40, afterSample: 641, sampled: 601 }, 180, 600)).toThrow(
      /during warmup/
    )
    expect(() => validateSimulationFrames({ afterWarmup: 181, afterSample: 181, sampled: 0 }, 180, 600)).toThrow(
      /Expected 601/
    )
    expect(() => validateSimulationFrames({ afterWarmup: 181, afterSample: 400, sampled: 219 }, 180, 600)).toThrow(
      /Expected 601/
    )
  })

  it('fails warning, error, and crash diagnostics instead of silently logging them', () => {
    expect(() => assertNoUnexpectedDiagnostics([], 'http://fixture.test')).not.toThrow()
    for (const diagnostic of [
      { kind: 'console', level: 'warning', text: 'console drift', url: 'http://fixture.test' },
      { kind: 'pageerror', level: 'error', text: 'page failure', url: 'http://fixture.test' },
      { kind: 'crash', level: 'error', text: 'page crashed', url: 'http://fixture.test' },
    ] as const) {
      expect(() => assertNoUnexpectedDiagnostics([diagnostic], 'http://fixture.test')).toThrow(diagnostic.text)
    }
  })

  it('accepts the complete profile marker set at approximately one span per frame', () => {
    expect(expectedEcsProfileMarkers('knightmark')).not.toContain('rebuildEffectTraits')
    const measures = Object.fromEntries(
      expectedEcsProfileMarkers('knightmark').map((name) => [name, Array.from({ length: 601 }, () => 0)])
    )
    expect(() =>
      validateEcsMarkers(measures, { example: 'knightmark', profile: true, sampledFrames: 600 })
    ).not.toThrow()
  })

  it('rejects a profile capture with a missing expected system marker', () => {
    const measures = Object.fromEntries(
      expectedEcsProfileMarkers('knightmark')
        .filter((name) => name !== 'transformSync')
        .map((name) => [name, Array.from({ length: 600 }, () => 0)])
    )
    expect(() => validateEcsMarkers(measures, { example: 'knightmark', profile: true, sampledFrames: 600 })).toThrow(
      /missing the transformSync marker/
    )
  })

  it('rejects ECS markers in an ordinary production capture', () => {
    expect(() =>
      validateEcsMarkers({ 'ecs:run': [1] }, { example: 'knightmark', profile: false, sampledFrames: 600 })
    ).toThrow(/unexpectedly contains three-flatland timing markers/)
    expect(() =>
      validateEcsMarkers({ futureSystem: [1] }, { example: 'knightmark', profile: false, sampledFrames: 600 })
    ).toThrow(/futureSystem/)
    expect(() => validateEcsMarkers({}, { example: 'knightmark', profile: false, sampledFrames: 600 })).not.toThrow()
  })

  it('rejects a profile system marker with the wrong frame count', () => {
    const measures = Object.fromEntries(
      expectedEcsProfileMarkers('lighting').map((name) => [
        name,
        Array.from({ length: name === 'shadowPipeline' ? 590 : 600 }, () => 0),
      ])
    )
    expect(() => validateEcsMarkers(measures, { example: 'lighting', profile: true, sampledFrames: 600 })).toThrow(
      /one shadowPipeline marker per sampled frame.*saw 590/
    )
  })
})
