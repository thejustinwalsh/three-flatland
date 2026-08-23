import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Sprite2DMaterial } from '../../../packages/three-flatland/src/materials/Sprite2DMaterial.ts'
import { SpriteGroup } from '../../../packages/three-flatland/src/pipeline/SpriteGroup.ts'
import { Sprite2D } from '../../../packages/three-flatland/src/sprites/Sprite2D.ts'
import type { Sprite2DOptions } from '../../../packages/three-flatland/src/sprites/types.ts'
import type { World } from '../../../packages/three-flatland/src/ecs/runtime/index.ts'

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

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!
}

function summary(values: readonly number[]): { median: number; p95: number } {
  return { median: percentile(values, 0.5), p95: percentile(values, 0.95) }
}

function makeGroup(expectedSprites: number | undefined): SpriteGroup {
  return expectedSprites === undefined ? new SpriteGroup() : new SpriteGroup({ expectedSprites })
}

function measure(expectedSprites: number | undefined): Observation {
  const texture = new Texture()
  const material = new Sprite2DMaterial({ map: texture })
  const sprites = Array.from({ length: options.count }, () => new Sprite2D({ material }))

  const start = performance.now()
  const group = makeGroup(expectedSprites)
  const constructionEnd = performance.now()
  const afterConstruction = (Reflect.get(group, '_world') as World | null)?.capacity ?? 0

  for (const sprite of sprites) group.add(sprite)
  const enrollmentEnd = performance.now()
  const world = group.world as World
  const afterEnrollment = world.capacity

  group.update()
  const firstUpdateEnd = performance.now()
  const stats = group.stats
  const checksum = sprites.reduce((sum, sprite) => sum + (sprite.entity ?? 0), 0)
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
  const initialCapacity = (group.world as World).capacity

  for (let index = 0; index < options.count; index++) group.add(new Sprite2D({ material }))
  group.update()
  const world = group.world as World
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

for (let index = 0; index < options.warmups; index++) {
  measure(index % 2 === 0 ? options.count : undefined)
  measure(index % 2 === 0 ? undefined : options.count)
}

const hinted: Observation[] = []
const unhinted: Observation[] = []
for (let index = 0; index < options.samples; index++) {
  if (index % 2 === 0) {
    hinted.push(measure(options.count))
    unhinted.push(measure(undefined))
  } else {
    unhinted.push(measure(undefined))
    hinted.push(measure(options.count))
  }
}

const harnessSources = [
  'expected-sprites.ts',
  '../../../packages/three-flatland/src/internal/capacity.ts',
  '../../../packages/three-flatland/src/internal/reserved-world.ts',
  '../../../packages/three-flatland/src/ecs/runtime/entity.ts',
  '../../../packages/three-flatland/src/ecs/runtime/sparse-set.ts',
  '../../../packages/three-flatland/src/ecs/runtime/world.ts',
  '../../../packages/three-flatland/src/ecs/batchUtils.ts',
  '../../../packages/three-flatland/src/pipeline/SpriteGroup.ts',
  '../../../packages/three-flatland/src/sprites/Sprite2D.ts',
] as const
const sourceHashes: Record<string, string> = {}
const harnessHash = createHash('sha256')
for (const source of harnessSources) {
  const contents = readFileSync(resolve(import.meta.dirname, source))
  sourceHashes[source] = createHash('sha256').update(contents).digest('hex')
  harnessHash.update(source)
  harnessHash.update(contents)
}

function observations(samples: readonly Observation[]) {
  return {
    capacities: samples.map((sample) => sample.capacities),
    checksums: samples.map((sample) => sample.checksum),
    phasesMs: {
      construction: summary(samples.map((sample) => sample.phasesMs.construction)),
      enrollment: summary(samples.map((sample) => sample.phasesMs.enrollment)),
      firstUpdate: summary(samples.map((sample) => sample.phasesMs.firstUpdate)),
      total: summary(samples.map((sample) => sample.phasesMs.total)),
    },
    topologies: samples.map((sample) => sample.topology),
  }
}

const report = {
  schemaVersion: 2,
  provenance: {
    harnessSha256: harnessHash.digest('hex'),
    harnessSources,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    sourceHashes,
    timestamp: new Date().toISOString(),
  },
  options,
  representation: {
    dense: 'Dense iteration arrays are not synthetically reserved; JavaScript has no portable reserve primitive.',
    gpu: 'No GPU batch is pre-created by expectedSprites; first update creates the measured topology.',
    indexAddressed:
      'Only active index-addressed arrays retain explicitly initialized default/absence slots through the hint.',
  },
  validation: validateLifecycle(),
  hinted: observations(hinted),
  unhinted: observations(unhinted),
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
