export const SIXTY_HZ_FRAME_BUDGET_MS = 16.667
export const LATE_RAF_THRESHOLD_MS = SIXTY_HZ_FRAME_BUDGET_MS * 1.5
export const FIXTURE_BATCH_CAPACITY = 16_384

const COMMON_ECS_PROFILE_MARKERS = [
  'ecs:run',
  'deferredDestroy',
  'checkMaterialVersions',
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
  simulationGated: boolean
  simulationFrame: number
  buildRevision: string
  fixtureSourceSha256: string
  buildDevtoolsEnabled: boolean
  buildProfileEnabled: boolean
  gpuAdapter: GpuAdapterIdentity
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

export interface BrowserCaptureFailure {
  target: string
  revision: string
  count: number
  phase: 'control' | 'observation' | 'fixture-parity'
  sample: number | null
  order: number | null
  url: string
  message: string
  diagnostics: BrowserDiagnostic[]
}

/**
 * Runs terminal cleanup without allowing its failure to replace an earlier
 * operation failure. If the operation succeeds, cleanup failures still
 * propagate normally.
 */
export async function withCleanupPreservingFirstError<T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<void>
): Promise<T> {
  let didOperationFail = false
  let operationError: unknown
  let result: T | undefined

  try {
    result = await operation()
  } catch (error) {
    didOperationFail = true
    operationError = error
  }

  try {
    await cleanup()
  } catch (cleanupError) {
    if (!didOperationFail) throw cleanupError
  }

  if (didOperationFail) throw operationError
  return result as T
}

export function browserCaptureFailure(
  error: unknown,
  diagnostics: readonly BrowserDiagnostic[],
  context: Omit<BrowserCaptureFailure, 'message' | 'diagnostics'>
): BrowserCaptureFailure {
  return {
    ...context,
    message: error instanceof Error ? error.message : String(error),
    diagnostics: [...diagnostics],
  }
}

export async function withBrowserFailureRecord<T>(
  operation: () => Promise<T>,
  context: Omit<BrowserCaptureFailure, 'message' | 'diagnostics'>,
  diagnostics: (error: unknown) => readonly BrowserDiagnostic[],
  persist: (failure: BrowserCaptureFailure) => void
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    persist(browserCaptureFailure(error, diagnostics(error), context))
    throw error
  }
}

export interface LongTaskEntry {
  startTime: number
  duration: number
}

export interface SimulationFrameWindow {
  afterWarmup: number
  afterSample: number
  sampled: number
}

export interface FrameRateSummary {
  median: number
  /** Slow-tail frame rate: the fifth percentile of per-frame FPS. */
  p05: number
  min: number
  max: number
}

export interface BenchmarkTarget {
  label: string
  url: string
  revision: string
}

export interface FixtureSourceIdentity {
  label: string
  fixtureSourceSha256: string
}

export interface GpuAdapterIdentity {
  vendor: string
  architecture: string
  device: string
  description: string
}

export interface GpuAdapterObservation {
  label: string
  gpuAdapter: unknown
}

export interface BrowserRunShape {
  counts: readonly number[]
  control: number
  samples: number
  warmupFrames: number
  sampleFrames: number
}

export function parseNonnegativeIntegerArgument(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new Error(`Invalid --${name}: ${value}; expected an integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid --${name}: ${value}; expected a safe integer`)
  return parsed
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!
}

export function frameRateSummary(intervals: readonly number[]): FrameRateSummary {
  if (intervals.length === 0) return { median: 0, p05: 0, min: 0, max: 0 }
  const rates = intervals.map((value) => 1000 / value)
  return {
    median: percentile(rates, 0.5),
    p05: percentile(rates, 0.05),
    min: Math.min(...rates),
    max: Math.max(...rates),
  }
}

export function parseBenchmarkTarget(value: string): BenchmarkTarget {
  const equals = value.indexOf('=')
  if (equals <= 0) throw new Error(`Expected label=url@revision, received: ${value}`)
  const label = value.slice(0, equals)
  if (label.trim().length === 0) throw new Error('Benchmark target label must not be empty')
  const urlAndRevision = value.slice(equals + 1)
  const separator = urlAndRevision.lastIndexOf('@')
  if (separator <= urlAndRevision.indexOf('://') + 2) {
    throw new Error(`Target ${label} is missing its full Git revision`)
  }

  const url = urlAndRevision.slice(0, separator)
  const revision = urlAndRevision.slice(separator + 1)
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error(`Target ${label} revision must be a full 40-character lowercase Git SHA: ${revision}`)
  }
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`Target ${label} must use an HTTP(S) URL: ${url}`)
  }
  return { label, url, revision }
}

export function validateBenchmarkTargets(targets: readonly BenchmarkTarget[]): void {
  const labels = new Set<string>()
  const urls = new Set<string>()
  for (const target of targets) {
    if (target.label.trim().length === 0) throw new Error('Benchmark target label must not be empty')
    if (labels.has(target.label)) throw new Error(`Duplicate benchmark target label: ${target.label}`)
    labels.add(target.label)

    const url = new URL(target.url).href
    if (urls.has(url)) throw new Error(`Duplicate benchmark target URL: ${target.url}`)
    urls.add(url)
  }
}

export function validateFixtureSourceParity(fixtures: readonly FixtureSourceIdentity[]): string {
  if (fixtures.length === 0) throw new Error('Fixture source parity requires at least one target')
  const expected = fixtures[0]!
  if (!/^[0-9a-f]{64}$/.test(expected.fixtureSourceSha256)) {
    throw new Error(`Invalid fixture source SHA-256 for ${expected.label}: ${expected.fixtureSourceSha256}`)
  }
  for (const fixture of fixtures.slice(1)) {
    if (!/^[0-9a-f]{64}$/.test(fixture.fixtureSourceSha256)) {
      throw new Error(`Invalid fixture source SHA-256 for ${fixture.label}: ${fixture.fixtureSourceSha256}`)
    }
    if (fixture.fixtureSourceSha256 !== expected.fixtureSourceSha256) {
      throw new Error(
        `Fixture source mismatch: ${expected.label}=${expected.fixtureSourceSha256}, ` +
          `${fixture.label}=${fixture.fixtureSourceSha256}`
      )
    }
  }
  return expected.fixtureSourceSha256
}

export function validateGpuAdapterParity(
  observations: readonly GpuAdapterObservation[],
  expected?: GpuAdapterIdentity
): GpuAdapterIdentity {
  if (observations.length === 0) throw new Error('GPU adapter parity requires at least one observation')

  let accepted = expected === undefined ? undefined : normalizeGpuAdapterIdentity(expected, 'expected GPU adapter')
  let acceptedLabel = expected ? 'expected GPU adapter' : observations[0]!.label
  for (const observation of observations) {
    const actual = normalizeGpuAdapterIdentity(observation.gpuAdapter, observation.label)
    if (accepted === undefined) {
      accepted = actual
      acceptedLabel = observation.label
      continue
    }
    if (
      actual.vendor !== accepted.vendor ||
      actual.architecture !== accepted.architecture ||
      actual.device !== accepted.device ||
      actual.description !== accepted.description
    ) {
      throw new Error(
        `GPU adapter mismatch: ${acceptedLabel}=${JSON.stringify(accepted)}, ` +
          `${observation.label}=${JSON.stringify(actual)}`
      )
    }
  }
  return accepted!
}

function normalizeGpuAdapterIdentity(value: unknown, label: string): GpuAdapterIdentity {
  if (value === null || value === undefined) throw new Error(`Missing GPU adapter identity for ${label}`)
  if (typeof value !== 'object') throw new Error(`Malformed GPU adapter identity for ${label}: expected an object`)

  const record = value as Record<string, unknown>
  const normalized = {} as Record<keyof GpuAdapterIdentity, string>
  for (const field of ['vendor', 'architecture', 'device', 'description'] as const) {
    const fieldValue = record[field]
    if (typeof fieldValue !== 'string') {
      throw new Error(`Malformed GPU adapter identity for ${label}: ${field} must be a string`)
    }
    normalized[field] = fieldValue.trim()
  }
  if (Object.values(normalized).every((field) => field.length === 0)) {
    throw new Error(`GPU adapter identity for ${label} has no stable identifying fields`)
  }
  return normalized
}

export function validateBrowserRunShape(shape: BrowserRunShape): void {
  for (const [name, value] of [
    ['control', shape.control],
    ['samples', shape.samples],
    ['warmup', shape.warmupFrames],
    ['frames', shape.sampleFrames],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`)
  }
  if (shape.counts.length === 0) throw new Error('--counts must contain at least one positive integer')
  const unique = new Set<number>()
  for (const count of shape.counts) {
    if (!Number.isSafeInteger(count) || count <= 0) throw new Error('--counts values must be positive integers')
    if (unique.has(count)) throw new Error(`--counts contains a duplicate value: ${count}`)
    unique.add(count)
  }
}

function unquoteYamlScalar(value: string): string {
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1)
  }
  return value
}

export function dependencyCatalogResolution(
  workspaceManifest: string,
  pnpmLock: string,
  packageName: string
): { catalogSpecifier: string; resolvedVersion: string } {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const catalogSpecifier = workspaceManifest.match(
    new RegExp(`^\\s*(?:'${escaped}'|${escaped}):\\s*([^\\s#]+)`, 'm')
  )?.[1]
  if (!catalogSpecifier) throw new Error(`Missing ${packageName} workspace catalog specifier`)

  const lockMatch = pnpmLock.match(
    new RegExp(
      `^    (?:'${escaped}'|${escaped}):\\r?\\n      specifier: ([^\\r\\n]+)\\r?\\n      version: ([^\\r\\n]+)`,
      'm'
    )
  )
  if (!lockMatch?.[1] || !lockMatch[2]) {
    throw new Error(`Missing ${packageName} resolution in pnpm-lock.yaml`)
  }
  const lockSpecifier = unquoteYamlScalar(lockMatch[1].trim())
  if (lockSpecifier !== catalogSpecifier) {
    throw new Error(
      `${packageName} catalog/lock specifier mismatch: workspace=${catalogSpecifier}, lock=${lockSpecifier}`
    )
  }
  return {
    catalogSpecifier,
    resolvedVersion: unquoteYamlScalar(lockMatch[2].trim()),
  }
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
    profile?: boolean
    revision: string
    sprites: number
    lights: number
  }
): void {
  validateGpuAdapterParity([{ label: 'fixture renderer device', gpuAdapter: readiness.gpuAdapter }])
  const expectedBatches = expectedFixtureBatches(expected.example, expected.sprites)
  if (!/^[0-9a-f]{64}$/.test(readiness.fixtureSourceSha256)) {
    throw new Error(`Invalid fixture source SHA-256: ${readiness.fixtureSourceSha256}`)
  }
  if (
    readiness.example !== expected.example ||
    readiness.variant !== expected.variant ||
    readiness.seed !== expected.seed ||
    readiness.fixedDeltaMs !== expected.fixedDeltaMs ||
    readiness.buildRevision !== expected.revision ||
    readiness.buildDevtoolsEnabled !== false ||
    readiness.buildProfileEnabled !== (expected.profile ?? false) ||
    readiness.requestedSprites !== expected.sprites ||
    readiness.actualSprites !== expected.sprites ||
    readiness.actualBatches !== expectedBatches ||
    readiness.simulationGated !== true ||
    readiness.simulationFrame !== 0
  ) {
    throw new Error(
      `Fixture mismatch: expected ${expected.example}/${expected.variant}, seed ${expected.seed}, ` +
        `revision ${expected.revision}, fixed delta ${String(expected.fixedDeltaMs)} ms, ` +
        `${expected.sprites} sprites, ${expectedBatches} batches, ` +
        'simulation paused at frame 0; ' +
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

export function lateRafCallbackCount(intervals: readonly number[]): number {
  return intervals.filter((interval) => interval > LATE_RAF_THRESHOLD_MS).length
}

export function validateSimulationFrames(
  frames: SimulationFrameWindow,
  warmupFrames: number,
  sampleFrames: number
): void {
  const expectedWarmupCallbacks = warmupFrames
  const expectedSampleCallbacks = sampleFrames + 1
  if (frames.afterWarmup <= 0 || frames.afterSample < frames.afterWarmup) {
    throw new Error(`Benchmark simulation did not advance monotonically: ${JSON.stringify(frames)}`)
  }
  if (Math.abs(frames.afterWarmup - expectedWarmupCallbacks) > 1) {
    throw new Error(
      `Expected approximately ${expectedWarmupCallbacks} simulation frames during warmup, ` +
        `received ${frames.afterWarmup}`
    )
  }
  if (Math.abs(frames.sampled - expectedSampleCallbacks) > 1) {
    throw new Error(
      `Expected ${expectedSampleCallbacks} simulation frames during the sample window, received ${frames.sampled}`
    )
  }
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
