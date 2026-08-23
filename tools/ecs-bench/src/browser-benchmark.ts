import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cpus, release as osRelease } from 'node:os'
import process from 'node:process'
import { chromium, type CDPSession } from '@playwright/test'
import {
  LATE_RAF_THRESHOLD_MS,
  SIXTY_HZ_FRAME_BUDGET_MS,
  assertNoUnexpectedDiagnostics,
  dependencyCatalogResolution,
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
  type BrowserCaptureFailure,
  type BrowserDiagnostic,
  type BrowserReadiness,
  type BenchmarkTarget,
  type GpuAdapterIdentity,
  type LongTaskEntry,
} from './browser-validation'

type Target = BenchmarkTarget

interface Options {
  targets: Target[]
  example: 'knightmark' | 'lighting'
  variant: 'three' | 'react'
  counts: number[]
  control: number
  lights: number
  samples: number
  warmupFrames: number
  sampleFrames: number
  seed: number
  collisions: boolean
  fixedDeltaMs: number
  profile: boolean
  headed: boolean
  output?: string
}

interface Summary {
  median: number
  p95: number
  min: number
  max: number
}

interface BrowserCapture {
  intervals: number[]
  longTasks: number[]
  measures: Record<string, number[]>
  readiness: BrowserReadiness
  diagnostics: BrowserDiagnostic[]
  heapUsedBytes: {
    afterWarmup: number
    afterSample: number
    delta: number
  }
  simulationFrames: {
    afterWarmup: number
    afterSample: number
    sampled: number
  }
  gpuAdapter: GpuAdapterIdentity | null
}

interface Observation {
  target: string
  revision: string
  count: number
  sample: number
  order: number
  url: string
  readiness: BrowserCapture['readiness']
  intervalMs: Summary
  fps: ReturnType<typeof frameRateSummary>
  lateRafCallbacks: number
  lateRafCallbackRate: number
  longTaskMs: Summary | null
  heapUsedBytes: BrowserCapture['heapUsedBytes']
  markers: Record<string, Summary & { count: number }>
  raw: BrowserCapture
}

class CaptureError extends Error {
  readonly diagnostics: BrowserDiagnostic[]

  constructor(error: unknown, diagnostics: readonly BrowserDiagnostic[]) {
    super(error instanceof Error ? error.message : String(error), { cause: error })
    this.name = 'CaptureError'
    this.diagnostics = [...diagnostics]
  }
}

const sourcePath = new URL(import.meta.url)
const harnessSources = [sourcePath, new URL('./browser-validation.ts', import.meta.url)] as const
const workspacePath = new URL('../../../pnpm-workspace.yaml', import.meta.url)
const pnpmLockPath = new URL('../../../pnpm-lock.yaml', import.meta.url)
const workspaceManifest = readFileSync(workspacePath, 'utf8')
const pnpmLock = readFileSync(pnpmLockPath, 'utf8')
const threeDependency = dependencyCatalogResolution(workspaceManifest, pnpmLock, 'three')
const reactThreeFiberDependency = dependencyCatalogResolution(workspaceManifest, pnpmLock, '@react-three/fiber')
const CAPTURE_TIMEOUT_MS = 180_000

function usage(message?: string, exitCode = 1): never {
  if (message) console.error(message)
  console.error(`
Usage:
  pnpm nx run @three-flatland/ecs-bench:benchmark:browser --args='\
    --target=base=http://127.0.0.1:4173@<40-character-sha> \
    --target=head=http://127.0.0.1:4174@<40-character-sha> \
    --example=knightmark --variant=three --counts=1000,40000 \
    --profile=0 --output=results/knightmark.json'

The target URL must serve a production Vite preview of the selected example.
Each observation launches a fresh Chromium process. Two targets run in the
interleaved order A/B, B/A, A/B to reduce order and thermal bias.
Use --profile=0 for ordinary production artifacts or --profile=1 when every
target was built with FL_PROFILE=true.
`)
  process.exit(exitCode)
}

function integer(value: string | undefined, fallback: number, name: string): number {
  try {
    return parseNonnegativeIntegerArgument(value, fallback, name)
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error))
  }
}

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed <= 0) usage(`Invalid --${name}: ${value}`)
  return parsed
}

function binaryFlag(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback
  if (value === '0') return false
  if (value === '1') return true
  usage(`Invalid --${name}: ${value}; expected 0 or 1`)
}

function parseOptions(argv: string[]): Options {
  if (argv.includes('--help')) usage(undefined, 0)
  const values = new Map<string, string[]>()
  for (const argument of argv) {
    if (!argument.startsWith('--')) usage(`Unexpected argument: ${argument}`)
    const [key, ...rest] = argument.slice(2).split('=')
    if (!key || rest.length === 0) usage(`Expected --name=value, received: ${argument}`)
    const entries = values.get(key) ?? []
    entries.push(rest.join('='))
    values.set(key, entries)
  }

  const targets = (values.get('target') ?? []).map((entry) => {
    try {
      return parseBenchmarkTarget(entry)
    } catch (error) {
      usage(error instanceof Error ? error.message : String(error))
    }
  })
  if (targets.length === 0 || targets.length > 2) usage('Provide one or two --target entries')
  try {
    validateBenchmarkTargets(targets)
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error))
  }

  const example = values.get('example')?.at(-1) ?? 'knightmark'
  if (example !== 'knightmark' && example !== 'lighting') usage(`Invalid --example: ${example}`)
  const variant = values.get('variant')?.at(-1) ?? 'three'
  if (variant !== 'three' && variant !== 'react') usage(`Invalid --variant: ${variant}`)
  const counts = (values.get('counts')?.at(-1) ?? '1000,40000').split(',').map((value) => integer(value, 0, 'counts'))
  if (counts.length === 0) usage('Provide at least one --counts value')

  const options: Options = {
    targets,
    example,
    variant,
    counts,
    control: integer(values.get('control')?.at(-1), example === 'knightmark' ? 1000 : 5, 'control'),
    lights: integer(values.get('lights')?.at(-1), 0, 'lights'),
    samples: integer(values.get('samples')?.at(-1), 3, 'samples'),
    warmupFrames: integer(values.get('warmup')?.at(-1), 180, 'warmup'),
    sampleFrames: integer(values.get('frames')?.at(-1), 600, 'frames'),
    seed: integer(values.get('seed')?.at(-1), 0xc0ffee, 'seed'),
    collisions: binaryFlag(values.get('collisions')?.at(-1), false, 'collisions'),
    fixedDeltaMs: positiveNumber(values.get('fixed-delta')?.at(-1), 16.6667, 'fixed-delta'),
    profile: binaryFlag(values.get('profile')?.at(-1), false, 'profile'),
    headed: binaryFlag(values.get('headed')?.at(-1), false, 'headed'),
    output: values.get('output')?.at(-1),
  }
  try {
    validateBrowserRunShape(options)
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error))
  }
  return options
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!
}

function summarize(values: number[]): Summary {
  if (values.length === 0) return { median: 0, p95: 0, min: 0, max: 0 }
  return {
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

function targetOrder(targets: Target[], sample: number): Target[] {
  return sample % 2 === 0 ? targets : [...targets].reverse()
}

function fixtureUrl(options: Options, target: Target, count: number): string {
  const url = new URL(target.url)
  url.searchParams.set('bench', '1')
  url.searchParams.set(options.example === 'knightmark' ? 'sprites' : 'slimes', String(count))
  url.searchParams.set('seed', String(options.seed))
  url.searchParams.set('fixedDelta', String(options.fixedDeltaMs))
  if (options.example === 'knightmark') url.searchParams.set('collisions', options.collisions ? '1' : '0')
  else url.searchParams.set('lights', String(options.lights))
  return url.href
}

async function withCaptureTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let captureTimeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        captureTimeout = setTimeout(
          () => reject(new Error(`Timed out after ${CAPTURE_TIMEOUT_MS} ms while ${label}`)),
          CAPTURE_TIMEOUT_MS
        )
      }),
    ])
  } finally {
    clearTimeout(captureTimeout)
  }
}

async function readHeapUsedBytes(session: CDPSession): Promise<number> {
  const result = (await session.send('Performance.getMetrics')) as {
    metrics: Array<{ name: string; value: number }>
  }
  const value = result.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error('Chromium did not expose Performance.JSHeapUsedSize')
  }
  return value
}

async function capture(options: Options, target: Target, count: number): Promise<BrowserCapture> {
  const diagnostics: BrowserDiagnostic[] = []
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !options.headed,
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
  })
  return withCleanupPreservingFirstError(
    async () => {
      try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
        const page = await context.newPage()
        const performanceSession = await context.newCDPSession(page)
        await performanceSession.send('Performance.enable')
        page.on('console', (message) => {
          const level = message.type()
          if (level === 'error' || level === 'warning') {
            diagnostics.push({
              kind: 'console',
              level,
              text: message.text(),
              url: page.url(),
              location: message.location(),
            })
          }
        })
        page.on('pageerror', (error) => {
          diagnostics.push({
            kind: 'pageerror',
            level: 'error',
            text: error.stack ?? error.message,
            url: page.url(),
          })
        })
        page.on('crash', () => {
          diagnostics.push({ kind: 'crash', level: 'error', text: 'Page crashed', url: page.url() })
        })
        // tsx/esbuild annotates nested functions with this helper before Playwright
        // serializes them into the page. Provide the identity form in the browser.
        await page.addInitScript('globalThis.__name = (target) => target')
        await page.addInitScript(() => {
          const entries: LongTaskEntry[] = []
          Object.defineProperty(window, '__THREE_FLATLAND_LONG_TASKS__', { value: entries })
          if ('PerformanceObserver' in window) {
            try {
              const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  entries.push({ startTime: entry.startTime, duration: entry.duration })
                }
              })
              observer.observe({ type: 'longtask', buffered: true })
              Object.defineProperty(window, '__THREE_FLATLAND_LONG_TASK_OBSERVER__', { value: observer })
            } catch {
              // Long-task observation is not supported by every Chromium mode.
            }
          }
        })
        await page.goto(fixtureUrl(options, target, count), { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => '__THREE_FLATLAND_BENCHMARK__' in window, undefined, { timeout: 120_000 })

        const readiness = await page.evaluate(() => {
          return (window as unknown as Window & { __THREE_FLATLAND_BENCHMARK__: BrowserCapture['readiness'] })
            .__THREE_FLATLAND_BENCHMARK__
        })
        validateFixtureReadiness(readiness, {
          example: options.example,
          variant: options.variant,
          seed: options.seed,
          collisions: options.collisions,
          fixedDeltaMs: options.fixedDeltaMs,
          profile: options.profile,
          revision: target.revision,
          sprites: count,
          lights: options.lights,
        })

        await page.evaluate(() => {
          const start = (
            window as Window & {
              __THREE_FLATLAND_BENCHMARK_START__?: () => void
            }
          ).__THREE_FLATLAND_BENCHMARK_START__
          if (!start) throw new Error('Benchmark fixture did not install its simulation start gate')
          start()
        })

        const simulationAfterWarmup = await withCaptureTimeout(
          page.evaluate(async (warmupFrames) => {
            await new Promise<void>((resolveFrames) => {
              let remaining = warmupFrames
              requestAnimationFrame(function frame() {
                if (--remaining <= 0) resolveFrames()
                else requestAnimationFrame(frame)
              })
            })
            const targetWindow = window as Window & {
              __THREE_FLATLAND_BENCHMARK_FRAME__?: number
              __THREE_FLATLAND_BENCHMARK_PAUSE__?: () => void
            }
            targetWindow.__THREE_FLATLAND_BENCHMARK_PAUSE__?.()
            return targetWindow.__THREE_FLATLAND_BENCHMARK_FRAME__ ?? -1
          }, options.warmupFrames),
          `warming ${page.url()}`
        )
        const heapAfterWarmup = await readHeapUsedBytes(performanceSession)

        const sample = await withCaptureTimeout(
          page.evaluate(async (sampleFrames) => {
            performance.clearMarks()
            performance.clearMeasures()
            const targetWindow = window as Window & {
              __THREE_FLATLAND_LONG_TASKS__?: LongTaskEntry[]
              __THREE_FLATLAND_LONG_TASK_OBSERVER__?: PerformanceObserver
              __THREE_FLATLAND_BENCHMARK_START__?: () => void
              __THREE_FLATLAND_BENCHMARK_PAUSE__?: () => void
              __THREE_FLATLAND_BENCHMARK_FRAME__?: number
            }
            const longTaskEntries = targetWindow.__THREE_FLATLAND_LONG_TASKS__
            const longTaskObserver = targetWindow.__THREE_FLATLAND_LONG_TASK_OBSERVER__
            if (longTaskEntries) {
              for (const entry of longTaskObserver?.takeRecords() ?? []) {
                longTaskEntries.push({ startTime: entry.startTime, duration: entry.duration })
              }
              longTaskEntries.splice(0)
            }
            const sampleStart = performance.now()
            const simulationBefore = targetWindow.__THREE_FLATLAND_BENCHMARK_FRAME__ ?? -1
            targetWindow.__THREE_FLATLAND_BENCHMARK_START__?.()

            const timestamps = await new Promise<number[]>((resolveFrames) => {
              const values: number[] = []
              requestAnimationFrame(function frame(timestamp) {
                values.push(timestamp)
                if (values.length >= sampleFrames + 1) resolveFrames(values)
                else requestAnimationFrame(frame)
              })
            })
            targetWindow.__THREE_FLATLAND_BENCHMARK_PAUSE__?.()
            const simulationAfter = targetWindow.__THREE_FLATLAND_BENCHMARK_FRAME__ ?? -1
            const sampleEnd = performance.now()
            for (const entry of longTaskObserver?.takeRecords() ?? []) {
              longTaskEntries?.push({ startTime: entry.startTime, duration: entry.duration })
            }
            const intervals = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]!)
            const measures: Record<string, number[]> = {}
            for (const entry of performance.getEntriesByType('measure')) {
              const detail = (entry as PerformanceMeasure & { detail?: unknown }).detail as
                | { devtools?: { trackGroup?: string } }
                | undefined
              if (detail?.devtools?.trackGroup !== 'three-flatland') continue
              const durations = measures[entry.name] ?? (measures[entry.name] = [])
              durations.push(entry.duration)
            }
            return {
              intervals,
              measures,
              longTaskEntries: [...(longTaskEntries ?? [])],
              sampleStart,
              sampleEnd,
              simulationBefore,
              simulationAfter,
            }
          }, options.sampleFrames),
          `sampling ${page.url()}`
        )
        const heapAfterSample = await readHeapUsedBytes(performanceSession)
        const simulationFrames = {
          afterWarmup: simulationAfterWarmup,
          afterSample: sample.simulationAfter,
          sampled: sample.simulationAfter - sample.simulationBefore,
        }
        validateSimulationFrames(simulationFrames, options.warmupFrames, options.sampleFrames)
        return {
          intervals: sample.intervals,
          measures: sample.measures,
          longTasks: longTaskDurations(sample.longTaskEntries, sample.sampleStart, sample.sampleEnd),
          readiness,
          diagnostics: [...diagnostics],
          heapUsedBytes: {
            afterWarmup: heapAfterWarmup,
            afterSample: heapAfterSample,
            delta: heapAfterSample - heapAfterWarmup,
          },
          simulationFrames,
          gpuAdapter: readiness.gpuAdapter,
        }
      } catch (error) {
        throw new CaptureError(error, diagnostics)
      }
    },
    async () => {
      await browser.close()
    }
  )
}

function observation(
  captureResult: BrowserCapture,
  target: Target,
  count: number,
  sample: number,
  order: number,
  url: string
): Observation {
  const markerSummaries = Object.fromEntries(
    Object.entries(captureResult.measures).map(([name, durations]) => [
      name,
      { ...summarize(durations), count: durations.length },
    ])
  )
  const ecsRuns = captureResult.measures['ecs:run']
  if (ecsRuns && Math.abs(ecsRuns.length - captureResult.intervals.length) > 1) {
    throw new Error(`Expected one ecs:run per frame for ${target.label}/${count}, saw ${ecsRuns.length}`)
  }
  const lateRafCallbacks = lateRafCallbackCount(captureResult.intervals)
  return {
    target: target.label,
    revision: target.revision,
    count,
    sample,
    order,
    url,
    readiness: captureResult.readiness,
    intervalMs: summarize(captureResult.intervals),
    fps: frameRateSummary(captureResult.intervals),
    lateRafCallbacks,
    lateRafCallbackRate: lateRafCallbacks / captureResult.intervals.length,
    longTaskMs: captureResult.longTasks.length > 0 ? summarize(captureResult.longTasks) : null,
    heapUsedBytes: captureResult.heapUsedBytes,
    markers: markerSummaries,
    raw: captureResult,
  }
}

function gitRevision(): string {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error(`Invalid harness source revision: ${revision}`)
  return revision
}

function assertCleanSourceTree(): void {
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
  if (status) throw new Error(`Browser benchmark evidence requires a clean source tree:\n${status}`)
}

function writeReport(
  options: Options,
  browserVersion: string,
  controls: Map<string, number>,
  controlCaptures: Map<string, BrowserCapture>,
  observations: Observation[],
  failures: BrowserCaptureFailure[],
  complete: boolean
): void {
  const harnessHash = createHash('sha256')
  for (const source of harnessSources) harnessHash.update(readFileSync(source))
  const harnessSha256 = harnessHash.digest('hex')
  const fixtureSourceHashes = [...controlCaptures.values()].map(
    (captureResult) => captureResult.readiness.fixtureSourceSha256
  )
  const fixtureSourceSha256 =
    fixtureSourceHashes.length > 0 && new Set(fixtureSourceHashes).size === 1 ? fixtureSourceHashes[0] : null
  const report = {
    schemaVersion: 4,
    capturedAt: new Date().toISOString(),
    complete,
    harnessSha256,
    harnessSources: harnessSources.map((source) => source.pathname.slice(source.pathname.lastIndexOf('/') + 1)),
    sourceRevision: gitRevision(),
    environment: {
      platform: process.platform,
      osRelease: osRelease(),
      arch: process.arch,
      cpu: cpus()[0]?.model ?? 'unknown',
      node: process.version,
      browser: browserVersion,
      browserChannel: 'chrome',
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      warmupFrames: options.warmupFrames,
      sampleFrames: options.sampleFrames,
      freshBrowserPerObservation: true,
      headed: options.headed,
      gpuArgs: ['--enable-unsafe-webgpu', '--use-angle=metal'],
      sixtyHzFrameBudgetMs: SIXTY_HZ_FRAME_BUDGET_MS,
      lateRafThresholdMs: LATE_RAF_THRESHOLD_MS,
      rafCadenceScope: 'requestAnimationFrame callback cadence; not GPU completion or confirmed presentation timing',
      heapMetric: 'Chromium Performance.JSHeapUsedSize; no forced GC',
      profileMarkersRequired: options.profile,
      threeCatalogSpecifier: threeDependency.catalogSpecifier,
      threeResolvedVersion: threeDependency.resolvedVersion,
      reactThreeFiberCatalogSpecifier: reactThreeFiberDependency.catalogSpecifier,
      reactThreeFiberResolvedVersion: reactThreeFiberDependency.resolvedVersion,
      pnpmLockSha256: createHash('sha256').update(pnpmLock).digest('hex'),
      gpuAdapters: Object.fromEntries(
        [...controlCaptures].map(([label, captureResult]) => [label, captureResult.gpuAdapter])
      ),
    },
    fixture: {
      example: options.example,
      variant: options.variant,
      seed: options.seed,
      collisions: options.example === 'knightmark' ? options.collisions : undefined,
      lights: options.example === 'lighting' ? options.lights : undefined,
      fixedDeltaMs: options.fixedDeltaMs,
      counts: options.counts,
      controlCount: options.control,
      fixtureSourceSha256,
      fixtureSourceParityVerified: controlCaptures.size === options.targets.length && fixtureSourceSha256 !== null,
    },
    targets: options.targets,
    controls: Object.fromEntries(controls),
    controlCaptures: Object.fromEntries(controlCaptures),
    observations,
    failures,
  }
  const output = JSON.stringify(report, null, 2) + '\n'
  if (options.output) {
    const path = resolve(options.output)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, output)
    if (complete) console.log(`Wrote ${path}`)
  } else if (complete) {
    console.log(output)
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))
  assertCleanSourceTree()
  const browserVersion = await chromium
    .launch({ channel: 'chrome', headless: !options.headed })
    .then(async (browser) => {
      try {
        return browser.version()
      } finally {
        await browser.close()
      }
    })
  const controls = new Map<string, number>()
  const controlCaptures = new Map<string, BrowserCapture>()
  const observations: Observation[] = []
  const failures: BrowserCaptureFailure[] = []
  let acceptedGpuAdapter: GpuAdapterIdentity | undefined

  const recordFailure = (failure: BrowserCaptureFailure): void => {
    failures.push(failure)
    writeReport(options, browserVersion, controls, controlCaptures, observations, failures, false)
  }

  const failureContext = (
    target: Target,
    count: number,
    phase: BrowserCaptureFailure['phase'],
    sample: number | null,
    order: number | null
  ): Omit<BrowserCaptureFailure, 'message' | 'diagnostics'> => ({
    target: target.label,
    revision: target.revision,
    count,
    phase,
    sample,
    order,
    url: fixtureUrl(options, target, count),
  })

  for (const target of options.targets) {
    let result: BrowserCapture | undefined
    await withBrowserFailureRecord(
      async () => {
        result = await capture(options, target, options.control)
        controlCaptures.set(target.label, result)
        controls.set(target.label, summarize(result.intervals).median)
        assertNoUnexpectedDiagnostics(result.diagnostics, fixtureUrl(options, target, options.control))
        validateEcsMarkers(result.measures, {
          example: options.example,
          profile: options.profile,
          sampledFrames: result.intervals.length,
        })
        acceptedGpuAdapter = validateGpuAdapterParity(
          [{ label: `${target.label} control`, gpuAdapter: result.gpuAdapter }],
          acceptedGpuAdapter
        )
        writeReport(options, browserVersion, controls, controlCaptures, observations, failures, false)
        console.log(`${target.label} control: ${controls.get(target.label)!.toFixed(3)} ms`)
      },
      failureContext(target, options.control, 'control', null, null),
      (error) => result?.diagnostics ?? (error instanceof CaptureError ? error.diagnostics : []),
      recordFailure
    )
  }
  await withBrowserFailureRecord(
    async () => {
      validateFixtureSourceParity(
        [...controlCaptures].map(([label, captureResult]) => ({
          label,
          fixtureSourceSha256: captureResult.readiness.fixtureSourceSha256,
        }))
      )
    },
    {
      target: 'fixture-parity',
      revision: options.targets.map((target) => target.revision).join(','),
      count: options.control,
      phase: 'fixture-parity',
      sample: null,
      order: null,
      url: options.targets.map((target) => target.url).join(','),
    },
    () => [...controlCaptures.values()].flatMap((captureResult) => captureResult.diagnostics),
    recordFailure
  )

  for (const count of options.counts) {
    for (let sample = 0; sample < options.samples; sample++) {
      const orderedTargets = targetOrder(options.targets, sample)
      for (let order = 0; order < orderedTargets.length; order++) {
        const target = orderedTargets[order]!
        const url = fixtureUrl(options, target, count)
        let result: BrowserCapture | undefined
        await withBrowserFailureRecord(
          async () => {
            result = await capture(options, target, count)
            const record = observation(result, target, count, sample, order, url)
            assertNoUnexpectedDiagnostics(result.diagnostics, url)
            validateEcsMarkers(result.measures, {
              example: options.example,
              profile: options.profile,
              sampledFrames: result.intervals.length,
            })
            acceptedGpuAdapter = validateGpuAdapterParity(
              [{ label: `${target.label} count ${count} sample ${sample + 1}`, gpuAdapter: result.gpuAdapter }],
              acceptedGpuAdapter
            )
            observations.push(record)
            writeReport(options, browserVersion, controls, controlCaptures, observations, failures, false)
            console.log(
              `${target.label} ${count} sample ${sample + 1}: ${record.fps.median.toFixed(2)} fps, ` +
                `${(record.lateRafCallbackRate * 100).toFixed(1)}% late RAF callbacks`
            )
          },
          failureContext(target, count, 'observation', sample, order),
          (error) => result?.diagnostics ?? (error instanceof CaptureError ? error.diagnostics : []),
          recordFailure
        )
      }
    }
  }

  writeReport(options, browserVersion, controls, controlCaptures, observations, failures, true)
}

await main()
