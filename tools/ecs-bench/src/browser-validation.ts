export const SIXTY_HZ_FRAME_BUDGET_MS = 16.667
export const MISSED_VSYNC_THRESHOLD_MS = SIXTY_HZ_FRAME_BUDGET_MS * 1.5
export const FIXTURE_BATCH_CAPACITY = 16_384

const COMMON_ECS_PROFILE_MARKERS = [
  'ecs:run',
  'deferredDestroy',
  'checkMaterialVersions',
  'rebuildEffectTraits',
  'batchRemove',
  'batchAssign',
  'batchReassign',
  'transformSync',
  'batchSort',
  'sceneGraphSync',
  'batchAssignLate',
  'flushDirtyRanges',
] as const

const LIGHTING_ECS_PROFILE_MARKERS = ['lightSync', 'lightEffect', 'lightMaterialAssign', 'shadowPipeline'] as const

export interface BrowserReadiness {
  example: 'knightmark' | 'lighting'
  variant: 'three' | 'react'
  seed: number
  fixedDeltaMs: number | null
  requestedSprites: number
  actualSprites: number
  actualBatches: number
  collisionsEnabled?: boolean
  requestedLights?: number
  actualLights?: number
}

export interface BrowserDiagnostic {
  kind: 'console' | 'pageerror' | 'crash'
  level: 'warning' | 'error'
  text: string
  url: string
  location?: {
    url: string
    lineNumber: number
    columnNumber: number
  }
}

export interface LongTaskEntry {
  startTime: number
  duration: number
}

export function expectedFixtureBatches(example: BrowserReadiness['example'], spriteCount: number): number {
  const spriteBatches = Math.ceil(spriteCount / FIXTURE_BATCH_CAPACITY)
  // Lighting has a separately sorted hero run in addition to the slime run.
  return example === 'lighting' ? 1 + spriteBatches : spriteBatches
}

export function validateFixtureReadiness(
  readiness: BrowserReadiness,
  expected: {
    example: BrowserReadiness['example']
    variant: BrowserReadiness['variant']
    seed: number
    collisions: boolean
    fixedDeltaMs: number | null
    sprites: number
    lights: number
  }
): void {
  const expectedBatches = expectedFixtureBatches(expected.example, expected.sprites)
  if (
    readiness.example !== expected.example ||
    readiness.variant !== expected.variant ||
    readiness.seed !== expected.seed ||
    readiness.fixedDeltaMs !== expected.fixedDeltaMs ||
    readiness.requestedSprites !== expected.sprites ||
    readiness.actualSprites !== expected.sprites ||
    readiness.actualBatches !== expectedBatches
  ) {
    throw new Error(
      `Fixture mismatch: expected ${expected.example}/${expected.variant}, seed ${expected.seed}, ` +
        `fixed delta ${String(expected.fixedDeltaMs)} ms, ${expected.sprites} sprites, ${expectedBatches} batches; ` +
        `received ${JSON.stringify(readiness)}`
    )
  }
  if (expected.example === 'knightmark' && readiness.collisionsEnabled !== expected.collisions) {
    throw new Error(`Knightmark collision fixture mismatch: ${JSON.stringify(readiness)}`)
  }
  if (
    expected.example === 'lighting' &&
    (readiness.requestedLights !== expected.lights ||
      readiness.actualLights !== Math.min(expected.lights, expected.sprites))
  ) {
    throw new Error(`Lighting fixture mismatch: ${JSON.stringify(readiness)}`)
  }
}

export function missedVsyncCount(intervals: readonly number[]): number {
  return intervals.filter((interval) => interval > MISSED_VSYNC_THRESHOLD_MS).length
}

export function expectedEcsProfileMarkers(example: BrowserReadiness['example']): readonly string[] {
  return example === 'lighting'
    ? [...COMMON_ECS_PROFILE_MARKERS, ...LIGHTING_ECS_PROFILE_MARKERS]
    : COMMON_ECS_PROFILE_MARKERS
}

export function validateEcsMarkers(
  measures: Readonly<Record<string, readonly number[]>>,
  expected: {
    example: BrowserReadiness['example']
    profile: boolean
    sampledFrames: number
  }
): void {
  const markerNames = expectedEcsProfileMarkers(expected.example)
  if (!expected.profile) {
    const present = Object.keys(measures)
    if (present.length > 0) {
      throw new Error(`Production capture unexpectedly contains three-flatland timing markers: ${present.join(', ')}`)
    }
    return
  }

  for (const name of markerNames) {
    const count = measures[name]?.length
    if (count === undefined) throw new Error(`Profile capture is missing the ${name} marker`)
    if (Math.abs(count - expected.sampledFrames) > 1) {
      throw new Error(
        `Expected approximately one ${name} marker per sampled frame ` +
          `(${expected.sampledFrames} frames), saw ${count}`
      )
    }
  }
}

export function longTaskDurations(entries: readonly LongTaskEntry[], sampleStart: number, sampleEnd: number): number[] {
  return entries
    .filter((entry) => entry.startTime >= sampleStart && entry.startTime < sampleEnd)
    .map((entry) => entry.duration)
}

export function assertNoUnexpectedDiagnostics(diagnostics: readonly BrowserDiagnostic[], url: string): void {
  if (diagnostics.length === 0) return
  throw new Error(`Unexpected browser diagnostics at ${url}: ${JSON.stringify(diagnostics)}`)
}
