import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform, release } from 'node:os'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

interface TimingResult {
  readonly checksums: readonly number[]
  readonly medianMs: number
  readonly observationsMs: readonly number[]
  readonly p95Ms: number
  readonly samples: number
  readonly warmups: number
}

interface WorkloadResult extends TimingResult {
  readonly operationsPerSample: number
}

interface Policy {
  readonly samples: number
  readonly warmups: number
}

interface StableBufferGrowth {
  readonly bufferGeneration: number
  readonly capacity: number
  readonly wrapperStable: boolean
}

const config = {
  growthInitialCapacity: 1_024,
  growthTargetCapacity: 262_144,
  length: 65_536,
  passes: 4,
  randomSeed: 0x5eedc0de,
  readWritePolicy: { samples: 40, warmups: 10 },
  growthPolicy: { samples: 30, warmups: 8 },
} as const

class StableFloat64Buffer {
  private buffer: Float64Array
  private generation = 0

  constructor(initialCapacity: number) {
    this.buffer = new Float64Array(initialCapacity)
  }

  get capacity(): number {
    return this.buffer.length
  }

  get bufferGeneration(): number {
    return this.generation
  }

  get(index: number): number {
    return this.buffer[index]!
  }

  set(index: number, value: number): void {
    if (index >= this.buffer.length) this.ensureCapacity(index + 1)
    this.buffer[index] = value
  }

  ensureCapacity(required: number): void {
    if (required <= this.buffer.length) return
    let capacity = Math.max(1, this.buffer.length)
    while (capacity < required) capacity *= 2
    const next = new Float64Array(capacity)
    next.set(this.buffer)
    this.buffer = next
    this.generation++
  }
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!
}

function measure<TFixture>(
  setup: (sample: number) => TFixture,
  run: (fixture: TFixture, sample: number) => number,
  policy: Policy
): TimingResult {
  for (let sample = -policy.warmups; sample < 0; sample++) {
    const fixture = setup(sample)
    run(fixture, sample)
  }

  const checksums: number[] = []
  const observations: number[] = []
  for (let sample = 0; sample < policy.samples; sample++) {
    const fixture = setup(sample)
    const start = performance.now()
    const checksum = run(fixture, sample)
    observations.push(performance.now() - start)
    checksums.push(checksum)
  }

  const sorted = [...observations].sort((left, right) => left - right)
  return {
    checksums,
    medianMs: percentile(sorted, 0.5),
    observationsMs: observations,
    p95Ms: percentile(sorted, 0.95),
    samples: policy.samples,
    warmups: policy.warmups,
  }
}

function fillNumberArray(length: number): number[] {
  return Array.from({ length }, (_, index) => index % 257)
}

function fillFloat64Array(length: number): Float64Array {
  const values = new Float64Array(length)
  for (let index = 0; index < length; index++) values[index] = index % 257
  return values
}

function fillStableBuffer(length: number): StableFloat64Buffer {
  const values = new StableFloat64Buffer(length)
  for (let index = 0; index < length; index++) values.set(index, index % 257)
  return values
}

function createRandomOrder(length: number, seed: number): Uint32Array {
  const order = new Uint32Array(length)
  for (let index = 0; index < length; index++) order[index] = index

  let state = seed >>> 0
  for (let index = length - 1; index > 0; index--) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    const target = (state >>> 0) % (index + 1)
    const value = order[index]!
    order[index] = order[target]!
    order[target] = value
  }
  return order
}

function orderChecksum(order: Uint32Array): number {
  let checksum = 0
  for (let index = 0; index < order.length; index++) {
    checksum = (Math.imul(checksum ^ order[index]!, 16_777_619) + index) >>> 0
  }
  return checksum
}

function sampleDelta(sample: number): number {
  return ((sample >>> 0) & 7) + 1
}

function sequentialNumberArray(values: number[], sample: number): number {
  let checksum = 0
  const delta = sampleDelta(sample)
  for (let pass = 0; pass < config.passes; pass++) {
    for (let index = 0; index < values.length; index++) {
      const next = values[index]! + delta
      values[index] = next
      checksum += next
    }
  }
  return checksum
}

function sequentialFloat64Array(values: Float64Array, sample: number): number {
  let checksum = 0
  const delta = sampleDelta(sample)
  for (let pass = 0; pass < config.passes; pass++) {
    for (let index = 0; index < values.length; index++) {
      const next = values[index]! + delta
      values[index] = next
      checksum += next
    }
  }
  return checksum
}

function sequentialStableBuffer(values: StableFloat64Buffer, sample: number): number {
  let checksum = 0
  const delta = sampleDelta(sample)
  for (let pass = 0; pass < config.passes; pass++) {
    for (let index = 0; index < config.length; index++) {
      const next = values.get(index) + delta
      values.set(index, next)
      checksum += next
    }
  }
  return checksum
}

function randomNumberArray(values: number[], order: Uint32Array, sample: number): number {
  let checksum = 0
  const delta = sampleDelta(sample)
  for (let pass = 0; pass < config.passes; pass++) {
    for (let cursor = 0; cursor < order.length; cursor++) {
      const index = order[cursor]!
      const next = values[index]! + delta
      values[index] = next
      checksum += next
    }
  }
  return checksum
}

function randomFloat64Array(values: Float64Array, order: Uint32Array, sample: number): number {
  let checksum = 0
  const delta = sampleDelta(sample)
  for (let pass = 0; pass < config.passes; pass++) {
    for (let cursor = 0; cursor < order.length; cursor++) {
      const index = order[cursor]!
      const next = values[index]! + delta
      values[index] = next
      checksum += next
    }
  }
  return checksum
}

function randomStableBuffer(values: StableFloat64Buffer, order: Uint32Array, sample: number): number {
  let checksum = 0
  const delta = sampleDelta(sample)
  for (let pass = 0; pass < config.passes; pass++) {
    for (let cursor = 0; cursor < order.length; cursor++) {
      const index = order[cursor]!
      const next = values.get(index) + delta
      values.set(index, next)
      checksum += next
    }
  }
  return checksum
}

function growNumberArray(values: number[]): number {
  values.length = config.growthTargetCapacity
  let checksum = values[0]! + values[config.growthInitialCapacity - 1]!
  for (let index = config.growthInitialCapacity; index < config.growthTargetCapacity; index++) {
    values[index] = index % 257
    checksum += values[index]!
  }
  return checksum
}

function growFloat64Array(values: Float64Array): number {
  const next = new Float64Array(config.growthTargetCapacity)
  next.set(values)
  let checksum = next[0]! + next[config.growthInitialCapacity - 1]!
  for (let index = config.growthInitialCapacity; index < config.growthTargetCapacity; index++) {
    next[index] = index % 257
    checksum += next[index]!
  }
  return checksum
}

function growStableBuffer(values: StableFloat64Buffer): number {
  values.ensureCapacity(config.growthTargetCapacity)
  let checksum = values.get(0) + values.get(config.growthInitialCapacity - 1)
  for (let index = config.growthInitialCapacity; index < config.growthTargetCapacity; index++) {
    values.set(index, index % 257)
    checksum += values.get(index)
  }
  return checksum
}

function workload(result: TimingResult, operationsPerSample: number): WorkloadResult {
  return { ...result, operationsPerSample }
}

function assertMatchingChecksums(
  workloadName: string,
  results: Readonly<Record<string, WorkloadResult>>
): readonly number[] {
  const entries = Object.entries(results)
  const expected = entries[0]![1].checksums
  for (const [strategy, result] of entries.slice(1)) {
    if (
      result.checksums.length !== expected.length ||
      result.checksums.some((checksum, index) => checksum !== expected[index])
    ) {
      throw new Error(`${workloadName} checksum mismatch for ${strategy}`)
    }
  }
  return expected
}

const randomOrder = createRandomOrder(config.length, config.randomSeed)
const readWriteOperations = config.length * config.passes * 2
const growthOperations = config.growthTargetCapacity - config.growthInitialCapacity

const sequential = {
  numberArray: workload(
    measure(() => fillNumberArray(config.length), sequentialNumberArray, config.readWritePolicy),
    readWriteOperations
  ),
  fixedFloat64Array: workload(
    measure(() => fillFloat64Array(config.length), sequentialFloat64Array, config.readWritePolicy),
    readWriteOperations
  ),
  stableGrowableFloat64: workload(
    measure(() => fillStableBuffer(config.length), sequentialStableBuffer, config.readWritePolicy),
    readWriteOperations
  ),
}

const random = {
  numberArray: workload(
    measure(
      () => fillNumberArray(config.length),
      (values, sample) => randomNumberArray(values, randomOrder, sample),
      config.readWritePolicy
    ),
    readWriteOperations
  ),
  fixedFloat64Array: workload(
    measure(
      () => fillFloat64Array(config.length),
      (values, sample) => randomFloat64Array(values, randomOrder, sample),
      config.readWritePolicy
    ),
    readWriteOperations
  ),
  stableGrowableFloat64: workload(
    measure(
      () => fillStableBuffer(config.length),
      (values, sample) => randomStableBuffer(values, randomOrder, sample),
      config.readWritePolicy
    ),
    readWriteOperations
  ),
}

const growth = {
  numberArray: workload(
    measure(() => fillNumberArray(config.growthInitialCapacity), growNumberArray, config.growthPolicy),
    growthOperations
  ),
  fixedFloat64Array: workload(
    measure(() => fillFloat64Array(config.growthInitialCapacity), growFloat64Array, config.growthPolicy),
    growthOperations
  ),
  stableGrowableFloat64: workload(
    measure(() => fillStableBuffer(config.growthInitialCapacity), growStableBuffer, config.growthPolicy),
    growthOperations
  ),
}

const numberReference = fillNumberArray(config.growthInitialCapacity)
const capturedNumberReference = numberReference
growNumberArray(numberReference)

const fixedReference = fillFloat64Array(config.growthInitialCapacity)
const capturedFixedReference = fixedReference
const grownFixedReference = new Float64Array(config.growthTargetCapacity)
grownFixedReference.set(fixedReference)

const stableReference = fillStableBuffer(config.growthInitialCapacity)
const capturedStableReference = stableReference
const initialStableGeneration = stableReference.bufferGeneration
stableReference.ensureCapacity(config.growthTargetCapacity)
const stableGrowth: StableBufferGrowth = {
  bufferGeneration: stableReference.bufferGeneration - initialStableGeneration,
  capacity: stableReference.capacity,
  wrapperStable: capturedStableReference === stableReference,
}

const validation = {
  growthChecksums: assertMatchingChecksums('growth', growth),
  randomChecksums: assertMatchingChecksums('random', random),
  sequentialChecksums: assertMatchingChecksums('sequential', sequential),
}

const harnessSources = ['numeric-storage.ts'] as const
const harnessHash = createHash('sha256')
for (const source of harnessSources) {
  harnessHash.update(source)
  harnessHash.update(readFileSync(resolve(import.meta.dirname, source)))
}

const report = {
  schemaVersion: 1,
  environment: {
    architecture: arch(),
    cpu: cpus()[0]?.model ?? 'unknown',
    harnessSha256: harnessHash.digest('hex'),
    harnessSources,
    mergeBase: execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim(),
    node: process.version,
    operatingSystem: `${platform()} ${release()}`,
  },
  config: {
    ...config,
    randomOrderChecksum: orderChecksum(randomOrder),
  },
  methodology: {
    checksumPolicy: 'Every measured sample checksum must match across all three strategies.',
    fixtureIsolation: 'Every warm-up and measured sample receives a fresh initialized store.',
    growthTimedRegion:
      'Capacity growth or replacement, existing-value copy where required, and initialization of the grown tail.',
    readWriteTimedRegion:
      'Only reads, writes, index traversal, and checksum accumulation; fixture initialization is outside timing.',
    timing: 'performance.now() wall-clock milliseconds in one process, strategies measured sequentially.',
  },
  strategies: {
    numberArray: {
      capacity: 'Implicit dynamic capacity managed by the JavaScript engine.',
      elementRepresentation: 'Engine-selected number representation.',
      referenceStability: {
        containerSurvivesGrowth: capturedNumberReference === numberReference,
        previouslyCapturedContainerSeesGrowth: capturedNumberReference.length === config.growthTargetCapacity,
      },
    },
    fixedFloat64Array: {
      capacity: `Exactly ${config.growthInitialCapacity} until explicitly replaced by a larger view.`,
      elementRepresentation: 'Contiguous 64-bit floating-point values.',
      referenceStability: {
        containerSurvivesGrowth: capturedFixedReference === grownFixedReference,
        oldCapacity: capturedFixedReference.length,
        replacementCapacity: grownFixedReference.length,
        previouslyCapturedContainerSeesGrowth: capturedFixedReference.length === config.growthTargetCapacity,
      },
    },
    stableGrowableFloat64: {
      capacity: 'Geometric power-of-two growth behind a stable method-based wrapper.',
      elementRepresentation: 'Contiguous 64-bit floating-point values behind one indirection.',
      referenceStability: {
        backingBufferReplacements: stableGrowth.bufferGeneration,
        containerSurvivesGrowth: stableGrowth.wrapperStable,
        resultingCapacity: stableGrowth.capacity,
      },
    },
  },
  validation: {
    allChecksumsMatch: true,
    ...validation,
  },
  workloads: {
    growth,
    randomReadWrite: random,
    sequentialReadWrite: sequential,
  },
}

const serialized = `${JSON.stringify(report, null, 2)}\n`
const outputPath = process.argv.find((value) => value.startsWith('--output='))?.slice(9)
if (outputPath === undefined) {
  process.stdout.write(serialized)
} else {
  const absoluteOutputPath = resolve(process.cwd(), outputPath)
  mkdirSync(dirname(absoluteOutputPath), { recursive: true })
  writeFileSync(absoluteOutputPath, serialized)
  process.stdout.write(`${absoluteOutputPath}\n`)
}
