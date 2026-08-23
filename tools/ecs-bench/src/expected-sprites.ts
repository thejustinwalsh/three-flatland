import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Sprite2DMaterial } from '../../../packages/three-flatland/src/materials/Sprite2DMaterial.ts'
import { SpriteGroup } from '../../../packages/three-flatland/src/pipeline/SpriteGroup.ts'
import { Sprite2D } from '../../../packages/three-flatland/src/sprites/Sprite2D.ts'
import type { Sprite2DOptions } from '../../../packages/three-flatland/src/sprites/types.ts'
import type { World } from '../../../packages/three-flatland/src/ecs/runtime/index.ts'
import { getSpriteGroupWorld } from '../../../packages/three-flatland/src/internal/sprite-group-runtime.ts'
import { spriteEntity } from '../../../packages/three-flatland/src/internal/sprite-runtime.ts'
import { timingSummary } from './benchmark-statistics.ts'
import { gitMergeBase } from './provenance.ts'

const ROOT = resolve(import.meta.dirname, '../../..')

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function sha256(contents: string | Buffer): string {
  return createHash('sha256').update(contents).digest('hex')
}

type TextureType = NonNullable<Sprite2DOptions['texture']>
const { Texture } = createRequire(resolve(import.meta.dirname, '../../../packages/three-flatland/package.json'))(
  'three'
) as { Texture: new () => TextureType }

interface Options {
  count: number
  samples: number
  warmups: number
}

interface Observation {
  capacities: {
    afterConstruction: number
    afterEnrollment: number
    afterFirstUpdate: number
  }
  checksum: number
  phasesMs: {
    construction: number
    enrollment: number
    firstUpdate: number
    total: number
  }
  topology: {
    batches: number
    sprites: number
    visibleSprites: number
  }
}

interface BenchmarkCase {
  expectedSprites: number | undefined
  name: 'unhinted' | 'under' | 'exact' | 'over'
}

function optionNumber(name: string, fallback: number): number {
  const position = process.argv.indexOf(name)
  const value = position === -1 ? fallback : Number(process.argv[position + 1])
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`)
  return value
}

const quick = process.argv.includes('--quick')
const options: Options = {
  count: optionNumber('--count', quick ? 128 : 16_384),
  samples: optionNumber('--samples', quick ? 3 : 20),
  warmups: optionNumber('--warmups', quick ? 1 : 5),
}

const gc = (globalThis as { gc?: () => void }).gc
if (!quick && gc === undefined) throw new Error('Definitive expectedSprites evidence requires Node --expose-gc')

function collectGarbage(): void {
  if (gc === undefined) return
  gc()
  gc()
}

function makeGroup(expectedSprites: number | undefined): SpriteGroup {
  return expectedSprites === undefined ? new SpriteGroup() : new SpriteGroup({ expectedSprites })
}

function measure(expectedSprites: number | undefined): Observation {
  const texture = new Texture()
  const material = new Sprite2DMaterial({ map: texture })
  const sprites = Array.from({ length: options.count }, () => new Sprite2D({ material }))

  // Workload setup is deliberately outside the timed constructor → enroll →
  // first-update interval. Collect only while every workload input is rooted.
  collectGarbage()
  const start = performance.now()
  const group = makeGroup(expectedSprites)
  const constructionEnd = performance.now()
  const afterConstruction = (Reflect.get(group, '_world') as World | null)?.capacity ?? 0

  for (const sprite of sprites) group.add(sprite)
  const enrollmentEnd = performance.now()
  const world = getSpriteGroupWorld(group) as World
  const afterEnrollment = world.capacity

  group.update()
  const firstUpdateEnd = performance.now()
  const stats = group.stats
  const checksum = sprites.reduce((sum, sprite) => sum + (spriteEntity(sprite) ?? 0), 0)
  if (
    stats.spriteCount !== options.count ||
    stats.visibleSprites !== options.count ||
    stats.batchCount === 0 ||
    checksum === 0
  ) {
    throw new Error('Enrollment topology/checksum validation failed')
  }

  const observation: Observation = {
    capacities: {
      afterConstruction,
      afterEnrollment,
      afterFirstUpdate: world.capacity,
    },
    checksum,
    phasesMs: {
      construction: constructionEnd - start,
      enrollment: enrollmentEnd - constructionEnd,
      firstUpdate: firstUpdateEnd - enrollmentEnd,
      total: firstUpdateEnd - start,
    },
    topology: {
      batches: stats.batchCount,
      sprites: stats.spriteCount,
      visibleSprites: stats.visibleSprites,
    },
  }

  group.dispose()
  material.dispose()
  texture.dispose()
  collectGarbage()
  return observation
}

function validateLifecycle(): {
  boundedOverflowGrowth: boolean
  capacityAtHint: number
  capacityPastHint: number
  capacityAfterReuse: number
  topologyAtHint: Observation['topology']
  zeroGrowthToHint: boolean
} {
  const texture = new Texture()
  const material = new Sprite2DMaterial({ map: texture })
  const group = new SpriteGroup({ expectedSprites: options.count })
  const initialCapacity = (getSpriteGroupWorld(group) as World).capacity

  for (let index = 0; index < options.count; index++) group.add(new Sprite2D({ material }))
  group.update()
  const world = getSpriteGroupWorld(group) as World
  const capacityAtHint = world.capacity
  const stats = group.stats

  group.add(new Sprite2D({ material }))
  group.update()
  const capacityPastHint = world.capacity

  group.clear()
  const capacityBeforeReuse = world.capacity
  for (let index = 0; index < options.count; index++) group.add(new Sprite2D({ material }))
  group.update()
  const capacityAfterReuse = world.capacity

  group.dispose()
  material.dispose()
  texture.dispose()
  return {
    boundedOverflowGrowth: capacityPastHint > capacityAtHint && capacityPastHint <= capacityAtHint * 2,
    capacityAfterReuse,
    capacityAtHint,
    capacityPastHint,
    topologyAtHint: {
      batches: stats.batchCount,
      sprites: stats.spriteCount,
      visibleSprites: stats.visibleSprites,
    },
    zeroGrowthToHint: capacityAtHint === initialCapacity && capacityAfterReuse === capacityBeforeReuse,
  }
}

const cases: readonly BenchmarkCase[] = [
  { expectedSprites: undefined, name: 'unhinted' },
  { expectedSprites: Math.floor(options.count / 2), name: 'under' },
  { expectedSprites: options.count, name: 'exact' },
  { expectedSprites: Math.min(options.count * 2, Number.MAX_SAFE_INTEGER), name: 'over' },
]

function rotatedCases(round: number): readonly BenchmarkCase[] {
  const offset = round % cases.length
  return [...cases.slice(offset), ...cases.slice(0, offset)]
}

for (let round = 0; round < options.warmups; round++) {
  for (const benchmarkCase of rotatedCases(round)) measure(benchmarkCase.expectedSprites)
}

const samples = new Map<BenchmarkCase['name'], Observation[]>(cases.map(({ name }) => [name, []]))
for (let round = 0; round < options.samples; round++) {
  for (const benchmarkCase of rotatedCases(round)) {
    samples.get(benchmarkCase.name)!.push(measure(benchmarkCase.expectedSprites))
  }
}

const harnessSources = [
  'expected-sprites.ts',
  'benchmark-statistics.ts',
  'provenance.ts',
  '../../../packages/three-flatland/src/internal/capacity.ts',
  '../../../packages/three-flatland/src/internal/reserved-world.ts',
  '../../../packages/three-flatland/src/ecs/runtime/entity.ts',
  '../../../packages/three-flatland/src/ecs/runtime/sparse-set.ts',
  '../../../packages/three-flatland/src/ecs/runtime/world.ts',
  '../../../packages/three-flatland/src/ecs/batchUtils.ts',
  '../../../packages/three-flatland/src/materials/Sprite2DMaterial.ts',
  '../../../packages/three-flatland/src/pipeline/SpriteGroup.ts',
  '../../../packages/three-flatland/src/sprites/Sprite2D.ts',
] as const
const sourceHashes: Record<string, string> = {}
const harnessHash = createHash('sha256')
for (const source of harnessSources) {
  const contents = readFileSync(resolve(import.meta.dirname, source))
  sourceHashes[source] = sha256(contents)
  harnessHash.update(source)
  harnessHash.update(contents)
}

const productionSources = git('ls-files', 'packages/three-flatland/src')
  .split('\n')
  .filter(
    (source) =>
      source.length > 0 &&
      /\.(?:ts|tsx)$/.test(source) &&
      !/\.(?:test|spec|bench)(?:-d)?\.(?:ts|tsx)$/.test(source) &&
      !source.endsWith('.type-test.ts')
  )
  .sort()
const productionSourceHash = createHash('sha256')
for (const source of productionSources) {
  productionSourceHash.update(source)
  productionSourceHash.update(readFileSync(resolve(ROOT, source)))
}

function observations(samples: readonly Observation[]) {
  return {
    raw: samples,
    phasesMs: {
      construction: timingSummary(samples.map((sample) => sample.phasesMs.construction)),
      enrollment: timingSummary(samples.map((sample) => sample.phasesMs.enrollment)),
      firstUpdate: timingSummary(samples.map((sample) => sample.phasesMs.firstUpdate)),
      total: timingSummary(samples.map((sample) => sample.phasesMs.total)),
    },
  }
}

const gitProvenance = {
  dirty: git('status', '--porcelain').length > 0,
  head: git('rev-parse', 'HEAD'),
  mergeBase: gitMergeBase(),
}
if (!quick && gitProvenance.dirty) {
  throw new Error('Definitive expectedSprites evidence requires a clean source tree')
}

const report = {
  schemaVersion: 4,
  provenance: {
    git: gitProvenance,
    harnessSha256: harnessHash.digest('hex'),
    harnessSources,
    lockfileSha256: sha256(readFileSync(resolve(ROOT, 'pnpm-lock.yaml'))),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    productionSourceSha256: productionSourceHash.digest('hex'),
    sourceHashes,
    timestamp: new Date().toISOString(),
  },
  options,
  cases: Object.fromEntries(
    cases.map(({ expectedSprites, name }) => [name, { expectedSprites: expectedSprites ?? null }])
  ),
  gc: {
    collectionsPerBoundary: gc === undefined ? 0 : 2,
    exposed: gc !== undefined,
    timed: false,
  },
  representation: {
    dense: 'Dense iteration arrays are not synthetically reserved; JavaScript has no portable reserve primitive.',
    gpu: 'No GPU batch is pre-created by expectedSprites; first update creates the measured topology.',
    indexAddressed:
      'Only active index-addressed arrays retain explicitly initialized default/absence slots through the hint.',
  },
  validation: validateLifecycle(),
  observations: Object.fromEntries(cases.map(({ name }) => [name, observations(samples.get(name)!)])),
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
