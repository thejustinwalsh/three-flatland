/**
 * Determinism harness for the Yoga layout boundary (task Y1 + Y2 + the informational A/B).
 *
 * Layout must be a pure, idempotent function of its inputs. This module builds synthetic
 * stress shapes on RAW Yoga (no uikit Component layer) and drives repeated
 * `calculateLayout()` passes, measuring the residual drift of the tracked node's snapped
 * `relativeCenter` — the value that drives the matrix and that "swims" in the live bug.
 *
 * Two regimes:
 *  - IDEMPOTENCY (Invariant A) — constant input, N relayouts, byte-identical output at the
 *    1/128 quantum. Yoga itself is deterministic, so this holds; it is the regression guard.
 *  - BOUNDARY SENSITIVITY (informational A/B) — each relayout re-enters the measure path
 *    with a sub-cell re-measurement perturbation (the frame-to-frame float noise live text
 *    carries). Sweeps grid x direction x boundary x dead-band to show where the
 *    non-representable 1/100 grid leaks and confirm the shipped 1/128 combo holds.
 *
 * The shipped derivation is `quantize()` from `../quantize.ts` — the SAME function
 * `flex/node.ts` ships — reproduced here by the `SHIPPED` snap so the harness cannot
 * drift from production math (asserted in the test).
 */
import { Align, FlexDirection, type MeasureFunction, type Yoga } from 'yoga-layout/load'
import { LAYOUT_GRID, nearEqual } from '../quantize.js'

/** Rounding direction for a harness snap axis. */
export type SnapDir = 'round' | 'floor' | 'ceil'

/** Which side(s) of the Yoga boundary the harness snap acts on. */
export type SnapBoundary = 'read' | 'write' | 'both'

/** A/B-swappable snap knob — the production path is the `SHIPPED` instance. */
export interface SnapConfig {
  grid: number
  /** Write-side (measure) direction. Yoga's native scheme ceils text size to avoid clipping. */
  measureDir: SnapDir
  /** Read-side (position/derivation) direction. */
  positionDir: SnapDir
  boundary: SnapBoundary
  /** Ratchet fallback: only re-commit a value that moved >= 1 full cell (compare-to-stored). */
  deadBand: boolean
}

/** The shipped production config: 1/128 grid, ceil measure, round-nearest position, both sides. */
export const SHIPPED: SnapConfig = {
  grid: LAYOUT_GRID,
  measureDir: 'ceil',
  positionDir: 'round',
  boundary: 'both',
  deadBand: false,
}

const snapsRead = (boundary: SnapBoundary): boolean => boundary === 'read' || boundary === 'both'
const snapsWrite = (boundary: SnapBoundary): boolean => boundary === 'write' || boundary === 'both'

function snapTo(value: number, grid: number, dir: SnapDir): number {
  const scaled = value * grid
  const snapped =
    dir === 'ceil' ? Math.ceil(scaled) : dir === 'floor' ? Math.floor(scaled) : Math.round(scaled)
  return snapped / grid
}

/** Measure-func output snap (write side). Pass-through when the boundary excludes writes. */
export function snapMeasure(value: number, config: SnapConfig): number {
  return snapsWrite(config.boundary) ? snapTo(value, config.grid, config.measureDir) : value
}

/** The node's read-side `relativeCenter` derivation. With `SHIPPED` this equals `quantize(...)`. */
export function deriveRelativeCenter(
  x: number,
  y: number,
  width: number,
  height: number,
  parentWidth: number,
  parentHeight: number,
  config: SnapConfig
): [x: number, y: number] {
  let centerX = x + width * 0.5 - parentWidth * 0.5
  let centerY = -(y + height * 0.5 - parentHeight * 0.5)
  if (snapsRead(config.boundary)) {
    centerX = snapTo(centerX, config.grid, config.positionDir)
    centerY = snapTo(centerY, config.grid, config.positionDir)
  }
  return [centerX, centerY]
}

/** A built synthetic tree plus the handles the runner needs to drive + read it. */
export interface Shape {
  /** Frame-to-frame re-measurement perturbation on the tracked node's intrinsic size. */
  jitter: number
  /** Re-dirty the measured leaf and run a full `calculateLayout` (one live-style relayout). */
  relayout(): void
  /** Raw Yoga computed box of the tracked node and its layout parent — no snap applied. */
  readRaw(): {
    left: number
    top: number
    width: number
    height: number
    parentWidth: number
    parentHeight: number
  }
  /** The tracked node's `relativeCenter`, derived + read-snapped per the shape's config. */
  readRelativeCenter(): [x: number, y: number]
  free(): void
}

export type ShapeBuilder = (yoga: Yoga, config: SnapConfig) => Shape

function makeConfig(yoga: Yoga, grid: number) {
  const config = yoga.Config.create()
  config.setUseWebDefaults(true)
  config.setPointScaleFactor(grid)
  return config
}

/** Intrinsic sizes for a measured-text child anchored under a taller sibling. */
export interface MeasuredRowSizes {
  containerWidth: number
  iconHeight: number
  titleWidth: number
  titleHeight: number
}

/**
 * A `flexDirection:row`, no-explicit-height container whose height is pinned by a taller
 * sibling. The `alignItems:flex-start` measured-text child is top-anchored, so as its
 * snapped height moves the box center — and thus `relativeCenter.y` — swims. This is the
 * "Heads up" / AlertTitle shape, generalized over its sizes so the fuzzer can sweep it.
 */
export function buildMeasuredRow(yoga: Yoga, config: SnapConfig, sizes: MeasuredRowSizes): Shape {
  const yogaConfig = makeConfig(yoga, config.grid)
  const root = yoga.Node.create(yogaConfig)
  root.setFlexDirection(FlexDirection.Column)
  root.setWidth(sizes.containerWidth)

  const row = yoga.Node.create(yogaConfig)
  row.setFlexDirection(FlexDirection.Row)
  row.setAlignItems(Align.FlexStart)
  root.insertChild(row, 0)

  const icon = yoga.Node.create(yogaConfig)
  icon.setWidth(sizes.iconHeight)
  icon.setHeight(sizes.iconHeight)
  row.insertChild(icon, 0)

  const title = yoga.Node.create(yogaConfig)
  const shape: Shape = {
    jitter: 0,
    relayout() {
      title.markDirty()
      root.calculateLayout(undefined, undefined)
    },
    readRaw() {
      return {
        left: title.getComputedLeft(),
        top: title.getComputedTop(),
        width: title.getComputedWidth(),
        height: title.getComputedHeight(),
        parentWidth: row.getComputedWidth(),
        parentHeight: row.getComputedHeight(),
      }
    },
    readRelativeCenter() {
      const b = this.readRaw()
      return deriveRelativeCenter(
        b.left,
        b.top,
        b.width,
        b.height,
        b.parentWidth,
        b.parentHeight,
        config
      )
    },
    free() {
      title.free()
      icon.free()
      row.free()
      root.free()
      yogaConfig.free()
    },
  }
  const measure: MeasureFunction = () => ({
    width: snapMeasure(sizes.titleWidth, config),
    height: snapMeasure(sizes.titleHeight + shape.jitter, config),
  })
  title.setMeasureFunc(measure)
  row.insertChild(title, 1)
  return shape
}

/** The named "Heads up" / AlertTitle fixture — off-grid sizes, the crawl's regression guard. */
export const buildHeadsUp: ShapeBuilder = (yoga, config) =>
  buildMeasuredRow(yoga, config, {
    containerWidth: 311.11,
    iconHeight: 23.73,
    titleWidth: 84.73,
    titleHeight: 17.31,
  })

/**
 * A deeply nested flex tree (column > row > column) with off-grid paddings and a
 * top-anchored measured leaf several levels down — checks the winning combo isn't
 * overfit to the shallow AlertTitle case.
 */
export const buildNestedFlex: ShapeBuilder = (yoga, config) => {
  const yogaConfig = makeConfig(yoga, config.grid)
  const root = yoga.Node.create(yogaConfig)
  root.setFlexDirection(FlexDirection.Column)
  root.setWidth(407.53)
  root.setHeight(263.19)
  root.setPadding(0 as never, 7.13)

  const row = yoga.Node.create(yogaConfig)
  row.setFlexDirection(FlexDirection.Row)
  row.setAlignItems(Align.FlexStart)
  row.setFlexGrow(1)
  root.insertChild(row, 0)

  const col = yoga.Node.create(yogaConfig)
  col.setFlexDirection(FlexDirection.Column)
  col.setFlexGrow(1)
  col.setPadding(0 as never, 5.37)
  row.insertChild(col, 0)

  const spacer = yoga.Node.create(yogaConfig)
  spacer.setWidth(31.29)
  spacer.setHeight(48.91)
  col.insertChild(spacer, 0)

  const leaf = yoga.Node.create(yogaConfig)
  const shape: Shape = {
    jitter: 0,
    relayout() {
      leaf.markDirty()
      root.calculateLayout(undefined, undefined)
    },
    readRaw() {
      return {
        left: leaf.getComputedLeft(),
        top: leaf.getComputedTop(),
        width: leaf.getComputedWidth(),
        height: leaf.getComputedHeight(),
        parentWidth: col.getComputedWidth(),
        parentHeight: col.getComputedHeight(),
      }
    },
    readRelativeCenter() {
      const b = this.readRaw()
      return deriveRelativeCenter(
        b.left,
        b.top,
        b.width,
        b.height,
        b.parentWidth,
        b.parentHeight,
        config
      )
    },
    free() {
      leaf.free()
      spacer.free()
      col.free()
      row.free()
      root.free()
      yogaConfig.free()
    },
  }
  const measure: MeasureFunction = () => ({
    width: snapMeasure(129.47, config),
    height: snapMeasure(21.83 + shape.jitter, config),
  })
  leaf.setMeasureFunc(measure)
  col.insertChild(leaf, 1)
  return shape
}

/**
 * A fixed-width row whose measured child wraps: the measured height is a function of the
 * available width Yoga offers, closing a feedback loop through Yoga's own resolved width.
 * A different tree so the winning combo isn't overfit.
 */
export const buildWrappingRow: ShapeBuilder = (yoga, config) => {
  const yogaConfig = makeConfig(yoga, config.grid)
  const root = yoga.Node.create(yogaConfig)
  root.setFlexDirection(FlexDirection.Row)
  root.setAlignItems(Align.FlexStart)
  root.setWidth(301.29)
  root.setHeight(97.61)

  const gutter = yoga.Node.create(yogaConfig)
  gutter.setWidth(37.19)
  root.insertChild(gutter, 0)

  const intrinsicTextWidth = 511.83
  const lineHeight = 18.47
  const text = yoga.Node.create(yogaConfig)
  text.setFlexGrow(1)
  const shape: Shape = {
    jitter: 0,
    relayout() {
      text.markDirty()
      root.calculateLayout(undefined, undefined)
    },
    readRaw() {
      return {
        left: text.getComputedLeft(),
        top: text.getComputedTop(),
        width: text.getComputedWidth(),
        height: text.getComputedHeight(),
        parentWidth: root.getComputedWidth(),
        parentHeight: root.getComputedHeight(),
      }
    },
    readRelativeCenter() {
      const b = this.readRaw()
      return deriveRelativeCenter(
        b.left,
        b.top,
        b.width,
        b.height,
        b.parentWidth,
        b.parentHeight,
        config
      )
    },
    free() {
      text.free()
      gutter.free()
      root.free()
      yogaConfig.free()
    },
  }
  const measure: MeasureFunction = (availableWidth) => {
    const usable =
      availableWidth > 0 && Number.isFinite(availableWidth) ? availableWidth : intrinsicTextWidth
    const lines = Math.max(1, Math.ceil(intrinsicTextWidth / usable))
    const width = Math.min(intrinsicTextWidth, usable)
    return {
      width: snapMeasure(width, config),
      height: snapMeasure(lines * lineHeight + shape.jitter, config),
    }
  }
  text.setMeasureFunc(measure)
  root.insertChild(text, 1)
  return shape
}

export const namedShapes: Record<string, ShapeBuilder> = {
  headsUp: buildHeadsUp,
  nestedFlex: buildNestedFlex,
  wrappingRow: buildWrappingRow,
}

/** The 128 grid is the common ruler drift is quoted in, regardless of the config's own grid. */
const QUANTUM = LAYOUT_GRID

/** Deterministic zero-mean low-discrepancy jitter, sub-cell for both grids. */
function jitterAt(pass: number, amplitude: number): number {
  const golden = 0.618033988749895
  return (2 * ((pass * golden) % 1) - 1) * amplitude
}

export interface DriftResult {
  /** Count of distinct committed values across the N tracked passes. 1 == byte-stable. */
  distinct: number
  /** Max deviation of the committed value in 128-grid cells — the common ruler. */
  maxDevCells: number
  /** True iff every tracked pass produced a byte-identical committed value. */
  byteStable: boolean
}

function summarize(values: Array<number>): DriftResult {
  const first = values[0]!
  const seen = new Set<number>()
  let maxDev = 0
  for (const value of values) {
    seen.add(value)
    const dev = Math.abs(value - first)
    if (dev > maxDev) {
      maxDev = dev
    }
  }
  return { distinct: seen.size, maxDevCells: maxDev * QUANTUM, byteStable: seen.size === 1 }
}

/**
 * Invariant A — constant input, N no-op relayouts, drift of the committed
 * `relativeCenter.y`. No jitter: the pure idempotency / "still" check.
 */
export function measureIdempotency(
  yoga: Yoga,
  builder: ShapeBuilder,
  config: SnapConfig,
  n = 120,
  warmup = 8
): DriftResult {
  const shape = builder(yoga, config)
  try {
    for (let i = 0; i < warmup; i++) {
      shape.relayout()
    }
    const values: Array<number> = []
    for (let i = 0; i < n; i++) {
      shape.relayout()
      values.push(shape.readRelativeCenter()[1])
    }
    return summarize(values)
  } finally {
    shape.free()
  }
}

/**
 * Classify control (LEAD FINDING) — is RAW Yoga's computed box byte-stable across N
 * constant-input relayouts at this grid, or does its incremental cache dither? No uikit
 * derivation, no read-side snap — the verdict is purely about Yoga.
 */
export function measureRawYogaIdempotency(
  yoga: Yoga,
  builder: ShapeBuilder,
  grid: number,
  n = 120,
  warmup = 8
): DriftResult {
  const config: SnapConfig = {
    grid,
    measureDir: 'ceil',
    positionDir: 'round',
    boundary: 'write',
    deadBand: false,
  }
  const shape = builder(yoga, config)
  try {
    for (let i = 0; i < warmup; i++) {
      shape.relayout()
    }
    const boxes = new Set<string>()
    const heights: Array<number> = []
    for (let i = 0; i < n; i++) {
      shape.relayout()
      const b = shape.readRaw()
      heights.push(b.height)
      boxes.add(`${b.left}|${b.top}|${b.width}|${b.height}|${b.parentWidth}|${b.parentHeight}`)
    }
    const result = summarize(heights)
    return { ...result, distinct: boxes.size, byteStable: boxes.size === 1 }
  } finally {
    shape.free()
  }
}

/**
 * Derivation-in-isolation — feed fixed synthetic Yoga outputs through the read-side
 * derivation N times. Pure function ⇒ always byte-stable; proves any observed drift enters
 * via Yoga output variation, not the JS math.
 */
export function measureDerivationIsolation(config: SnapConfig, n = 120): DriftResult {
  const values: Array<number> = []
  for (let i = 0; i < n; i++) {
    values.push(deriveRelativeCenter(31.4, 0, 84.73, 17.31, 311.11, 23.73, config)[1])
  }
  return summarize(values)
}

/**
 * Boundary sensitivity — drive one shape N passes under sub-cell re-measurement jitter,
 * tracking the committed `relativeCenter.y`. The dead-band, when on, only re-commits a value
 * that moved >= 1 full cell from the last committed value (compare-to-stored, not re-snap-raw).
 */
export function measureJitterDrift(
  yoga: Yoga,
  builder: ShapeBuilder,
  config: SnapConfig,
  amplitude: number,
  n = 120,
  warmup = 8
): DriftResult {
  const shape = builder(yoga, config)
  try {
    for (let i = 0; i < warmup; i++) {
      shape.relayout()
    }
    const cell = 1 / config.grid
    const values: Array<number> = []
    let committed = Number.NaN
    for (let i = 0; i < n; i++) {
      shape.jitter = jitterAt(i, amplitude)
      shape.relayout()
      const candidate = shape.readRelativeCenter()[1]
      if (i === 0 || !config.deadBand) {
        committed = candidate
      } else if (Math.abs(candidate - committed) >= cell) {
        committed = candidate
      }
      values.push(committed)
    }
    return summarize(values)
  } finally {
    shape.free()
  }
}

/**
 * Production model — sub-cell re-measurement jitter passed through the FlexNode measure
 * gate (`nearEqual` on the intrinsic min-size, as `flex/node.ts` ships). Noise within one
 * cell is rejected BEFORE it can trigger a relayout, so the committed value never moves.
 * Demonstrates why the dead-band stays a fallback: the gate is the upstream defense.
 */
export function measureGatedJitterDrift(
  yoga: Yoga,
  sizes: MeasuredRowSizes,
  config: SnapConfig,
  amplitude: number,
  n = 120,
  warmup = 8
): DriftResult {
  const shape = buildMeasuredRow(yoga, config, sizes)
  try {
    shape.jitter = 0
    for (let i = 0; i < warmup; i++) {
      shape.relayout()
    }
    let lastIntrinsic = sizes.titleHeight
    let committed = shape.readRelativeCenter()[1]
    const values: Array<number> = [committed]
    for (let i = 0; i < n; i++) {
      const intrinsic = sizes.titleHeight + jitterAt(i, amplitude)
      if (!nearEqual(intrinsic, lastIntrinsic)) {
        shape.jitter = intrinsic - sizes.titleHeight
        shape.relayout()
        lastIntrinsic = intrinsic
        committed = shape.readRelativeCenter()[1]
      }
      values.push(committed)
    }
    return summarize(values)
  } finally {
    shape.free()
  }
}

/** Deterministic PRNG (mulberry32) so every combo sees the identical fuzz corpus. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A fuzz corpus of randomized measured-row sizes — identical across combos (fixed seed). */
export function fuzzCorpus(count: number, seed = 0x9e3779b9): Array<MeasuredRowSizes> {
  const rand = mulberry32(seed)
  const corpus: Array<MeasuredRowSizes> = []
  for (let i = 0; i < count; i++) {
    const titleHeight = 12 + rand() * 12
    corpus.push({
      containerWidth: 220 + rand() * 200,
      iconHeight: Math.ceil(titleHeight) + 4 + rand() * 6,
      titleWidth: 48 + rand() * 120,
      titleHeight,
    })
  }
  return corpus
}

export interface SweepResult {
  /** How many fuzz shapes drifted (committed value not byte-stable over N). */
  drifting: number
  total: number
  /** Worst-case committed drift across the corpus, in 128-grid cells. */
  maxDevCells: number
  /** True iff no shape in the corpus drifted. */
  byteStable: boolean
}

export interface SweepRow {
  grid: number
  direction: SnapDir | '—'
  boundary: SnapBoundary
  deadBand: boolean
  result: SweepResult
}

const directions: Array<SnapDir> = ['round', 'floor', 'ceil']
const boundaries: Array<SnapBoundary> = ['read', 'write', 'both']

/**
 * Full informational A/B matrix for the measured-row shape: grid x direction x boundary x
 * dead-band, aggregated over the fuzz corpus under sub-cell jitter. When the boundary excludes
 * the read side the position direction is inert, so those combos are emitted once ('—').
 */
export function sweepCombos(
  yoga: Yoga,
  corpus: Array<MeasuredRowSizes>,
  amplitude: number,
  n = 120
): Array<SweepRow> {
  const rows: Array<SweepRow> = []
  for (const grid of [100, 128]) {
    for (const boundary of boundaries) {
      const dirs = snapsRead(boundary) ? directions : (['—'] as const)
      for (const direction of dirs) {
        for (const deadBand of [false, true]) {
          const positionDir = direction === '—' ? 'round' : direction
          const config: SnapConfig = { grid, measureDir: 'ceil', positionDir, boundary, deadBand }
          let drifting = 0
          let maxDevCells = 0
          for (const sizes of corpus) {
            const result = measureJitterDrift(
              yoga,
              (y, c) => buildMeasuredRow(y, c, sizes),
              config,
              amplitude,
              n
            )
            if (!result.byteStable) {
              drifting++
            }
            if (result.maxDevCells > maxDevCells) {
              maxDevCells = result.maxDevCells
            }
          }
          rows.push({
            grid,
            direction,
            boundary,
            deadBand,
            result: { drifting, total: corpus.length, maxDevCells, byteStable: drifting === 0 },
          })
        }
      }
    }
  }
  return rows
}

/** Render a sweep as a fixed-width table for pasting into the gate report. */
export function formatSweep(title: string, rows: Array<SweepRow>): string {
  const header = `grid | dir   | boundary | deadband | drifting/total | maxDevCells | byteStable`
  const sep = `-----|-------|----------|----------|----------------|-------------|-----------`
  const body = rows
    .map((row) => {
      const grid = String(row.grid).padEnd(4)
      const dir = String(row.direction).padEnd(5)
      const boundary = row.boundary.padEnd(8)
      const deadBand = String(row.deadBand).padEnd(8)
      const ratio = `${row.result.drifting}/${row.result.total}`.padEnd(14)
      const cells = row.result.maxDevCells.toFixed(4).padEnd(11)
      const stable = row.result.byteStable ? 'YES' : 'no'
      return `${grid} | ${dir} | ${boundary} | ${deadBand} | ${ratio} | ${cells} | ${stable}`
    })
    .join('\n')
  return `### ${title}\n${header}\n${sep}\n${body}`
}
