import { describe, expect, it } from 'vitest'
import {
  MISSED_VSYNC_THRESHOLD_MS,
  SIXTY_HZ_FRAME_BUDGET_MS,
  assertNoUnexpectedDiagnostics,
  expectedFixtureBatches,
  expectedEcsProfileMarkers,
  longTaskDurations,
  missedVsyncCount,
  validateEcsMarkers,
  validateFixtureReadiness,
  type BrowserReadiness,
} from './browser-validation'

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
    ...overrides,
  }
}

describe('browser benchmark validation', () => {
  it('pins the presented-frame metric to an explicit 16.667 ms budget', () => {
    expect(SIXTY_HZ_FRAME_BUDGET_MS).toBe(16.667)
    expect(MISSED_VSYNC_THRESHOLD_MS).toBeCloseTo(25.0005)
    expect(missedVsyncCount([8.333, 16.667, 25.0005, 25.001])).toBe(1)
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
        sprites: 40_000,
        lights: 0,
      })
    ).not.toThrow()
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
  ] as const)('rejects a mismatched %s control', (_name, override) => {
    expect(() =>
      validateFixtureReadiness(readiness(override), {
        example: 'knightmark',
        variant: 'react',
        seed: 0xc0ffee,
        collisions: false,
        fixedDeltaMs: 16.6667,
        sprites: 40_000,
        lights: 0,
      })
    ).toThrow(/mismatch/i)
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
