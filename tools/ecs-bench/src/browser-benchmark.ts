import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { chromium, type CDPSession } from '@playwright/test'
import {
  MISSED_VSYNC_THRESHOLD_MS,
  SIXTY_HZ_FRAME_BUDGET_MS,
  assertNoUnexpectedDiagnostics,
  longTaskDurations,
  missedVsyncCount,
  validateEcsMarkers,
  validateFixtureReadiness,
  type BrowserDiagnostic,
  type BrowserReadiness,
  type LongTaskEntry,
} from './browser-validation'

interface Target {
  label: string
  url: string
  revision: string
}

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
  fps: Summary
  missedVsyncFrames: number
  missedVsyncRate: number
  longTaskMs: Summary | null
  heapUsedBytes: BrowserCapture['heapUsedBytes']
  markers: Record<string, Summary & { count: number }>
  raw: BrowserCapture
}

const sourcePath = new URL(import.meta.url)
const harnessSources = [sourcePath, new URL('./browser-validation.ts', import.meta.url)] as const
const CAPTURE_TIMEOUT_MS = 180_000

function usage(message?: string, exitCode = 1): never {
  if (message) console.error(message)
  console.error(`
Usage:
  pnpm nx run @three-flatland/ecs-bench:benchmark:browser --args='\
    --target=base=http://127.0.0.1:4173@<sha> \
    --target=head=http://127.0.0.1:4174@<sha> \
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
  if (value === undefined) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) usage(`Invalid --${name}: ${value}`)
  return parsed
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

function revisionAt(url: string): { url: string; revision: string } {
  const separator = url.lastIndexOf('@')
  if (separator <= url.indexOf('://') + 2) return { url, revision: 'unspecified' }
  return { url: url.slice(0, separator), revision: url.slice(separator + 1) }
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
    const equals = entry.indexOf('=')
    if (equals <= 0) usage(`Expected --target=label=url@revision, received: ${entry}`)
    const label = entry.slice(0, equals)
    const parsed = revisionAt(entry.slice(equals + 1))
    return { label, ...parsed }
  })
  if (targets.length === 0 || targets.length > 2) usage('Provide one or two --target entries')

  const example = values.get('example')?.at(-1) ?? 'knightmark'
  if (example !== 'knightmark' && example !== 'lighting') usage(`Invalid --example: ${example}`)
  const variant = values.get('variant')?.at(-1) ?? 'three'
  if (variant !== 'three' && variant !== 'react') usage(`Invalid --variant: ${variant}`)
  const counts = (values.get('counts')?.at(-1) ?? '1000,40000').split(',').map((value) => integer(value, 0, 'counts'))
  if (counts.length === 0) usage('Provide at least one --counts value')

  return {
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
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !options.headed,
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
  })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    const performanceSession = await context.newCDPSession(page)
    await performanceSession.send('Performance.enable')
    const diagnostics: BrowserDiagnostic[] = []
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
      sprites: count,
      lights: options.lights,
    })

    await withCaptureTimeout(
      page.evaluate(async (warmupFrames) => {
        await new Promise<void>((resolveFrames) => {
          let remaining = warmupFrames
          requestAnimationFrame(function frame() {
            if (remaining-- <= 0) resolveFrames()
            else requestAnimationFrame(frame)
          })
        })
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

        const timestamps = await new Promise<number[]>((resolveFrames) => {
          const values: number[] = []
          requestAnimationFrame(function frame(timestamp) {
            values.push(timestamp)
            if (values.length >= sampleFrames + 1) resolveFrames(values)
            else requestAnimationFrame(frame)
          })
        })
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
        }
      }, options.sampleFrames),
      `sampling ${page.url()}`
    )
    const heapAfterSample = await readHeapUsedBytes(performanceSession)
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
    }
  } finally {
    await browser.close()
  }
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
  const missedVsyncFrames = missedVsyncCount(captureResult.intervals)
  return {
    target: target.label,
    revision: target.revision,
    count,
    sample,
    order,
    url,
    readiness: captureResult.readiness,
    intervalMs: summarize(captureResult.intervals),
    fps: summarize(captureResult.intervals.map((value) => 1000 / value)),
    missedVsyncFrames,
    missedVsyncRate: missedVsyncFrames / captureResult.intervals.length,
    longTaskMs: captureResult.longTasks.length > 0 ? summarize(captureResult.longTasks) : null,
    heapUsedBytes: captureResult.heapUsedBytes,
    markers: markerSummaries,
    raw: captureResult,
  }
}

function gitRevision(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function writeReport(
  options: Options,
  browserVersion: string,
  controls: Map<string, number>,
  controlCaptures: Map<string, BrowserCapture>,
  observations: Observation[],
  complete: boolean
): void {
  const harnessHash = createHash('sha256')
  for (const source of harnessSources) harnessHash.update(readFileSync(source))
  const harnessSha256 = harnessHash.digest('hex')
  const report = {
    schemaVersion: 2,
    capturedAt: new Date().toISOString(),
    complete,
    harnessSha256,
    harnessSources: harnessSources.map((source) => source.pathname.slice(source.pathname.lastIndexOf('/') + 1)),
    sourceRevision: gitRevision(),
    environment: {
      platform: process.platform,
      arch: process.arch,
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
      missedVsyncThresholdMs: MISSED_VSYNC_THRESHOLD_MS,
      heapMetric: 'Chromium Performance.JSHeapUsedSize; no forced GC',
      profileMarkersRequired: options.profile,
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
    },
    targets: options.targets,
    controls: Object.fromEntries(controls),
    controlCaptures: Object.fromEntries(controlCaptures),
    observations,
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
  for (const target of options.targets) {
    const result = await capture(options, target, options.control)
    controlCaptures.set(target.label, result)
    controls.set(target.label, summarize(result.intervals).median)
    writeReport(options, browserVersion, controls, controlCaptures, [], false)
    assertNoUnexpectedDiagnostics(result.diagnostics, fixtureUrl(options, target, options.control))
    validateEcsMarkers(result.measures, {
      example: options.example,
      profile: options.profile,
      sampledFrames: result.intervals.length,
    })
    console.log(`${target.label} control: ${controls.get(target.label)!.toFixed(3)} ms`)
  }

  const observations: Observation[] = []
  for (const count of options.counts) {
    for (let sample = 0; sample < options.samples; sample++) {
      const orderedTargets = targetOrder(options.targets, sample)
      for (let order = 0; order < orderedTargets.length; order++) {
        const target = orderedTargets[order]!
        const url = fixtureUrl(options, target, count)
        const result = await capture(options, target, count)
        const record = observation(result, target, count, sample, order, url)
        observations.push(record)
        writeReport(options, browserVersion, controls, controlCaptures, observations, false)
        assertNoUnexpectedDiagnostics(result.diagnostics, url)
        validateEcsMarkers(result.measures, {
          example: options.example,
          profile: options.profile,
          sampledFrames: result.intervals.length,
        })
        console.log(
          `${target.label} ${count} sample ${sample + 1}: ${record.fps.median.toFixed(2)} fps, ` +
            `${(record.missedVsyncRate * 100).toFixed(1)}% missed`
        )
      }
    }
  }

  writeReport(options, browserVersion, controls, controlCaptures, observations, true)
}

await main()
