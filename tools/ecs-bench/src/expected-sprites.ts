import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { Sprite2DMaterial } from '../../../packages/three-flatland/src/materials/Sprite2DMaterial.ts'
import { SpriteGroup } from '../../../packages/three-flatland/src/pipeline/SpriteGroup.ts'
import { Sprite2D } from '../../../packages/three-flatland/src/sprites/Sprite2D.ts'
import type { Sprite2DOptions } from '../../../packages/three-flatland/src/sprites/types.ts'
import {
  observeCapacityGrowth,
  type CapacityGrowthEvent,
} from '../../../packages/three-flatland/src/internal/capacity.ts'

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
  constructionMs: number
  enrollmentMs: number
  enrollmentGrowths: number
  checksum: number
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

function measure(expectedSprites: number | undefined): Observation {
  const texture = new Texture()
  const material = new Sprite2DMaterial({ map: texture })
  const sprites = Array.from({ length: options.count }, () => new Sprite2D({ material }))
  const constructionStart = performance.now()
  const group = new SpriteGroup({ expectedSprites })
  const constructionMs = performance.now() - constructionStart
  const events: CapacityGrowthEvent[] = []
  const stop = observeCapacityGrowth(group, (event) => events.push(event))
  const eventStart = events.length
  const enrollmentStart = performance.now()
  for (const sprite of sprites) group.add(sprite)
  const enrollmentMs = performance.now() - enrollmentStart
  const checksum = sprites.reduce((sum, sprite) => sum + (sprite.entity ?? 0), 0)
  const enrollmentGrowths = events.slice(eventStart).filter((event) => event.reason === 'growth').length

  if (group.spriteCount !== options.count || checksum === 0) throw new Error('Enrollment checksum failed')
  stop()
  group.dispose()
  material.dispose()
  texture.dispose()
  return { checksum, constructionMs, enrollmentGrowths, enrollmentMs }
}

function validateLifecycle(): {
  boundedGrowth: boolean
  growthsPastHint: number
  reuseGrowths: number
  zeroGrowthToHint: boolean
} {
  const texture = new Texture()
  const material = new Sprite2DMaterial({ map: texture })
  const group = new SpriteGroup({ expectedSprites: options.count })
  const events: CapacityGrowthEvent[] = []
  const stop = observeCapacityGrowth(group, (event) => events.push(event))
  const initialGrowths = events.filter((event) => event.reason === 'growth').length
  for (let index = 0; index < options.count; index++) group.add(new Sprite2D({ material }))
  group.update()
  const growthsAtHint = events.filter((event) => event.reason === 'growth').length

  group.add(new Sprite2D({ material }))
  const overflowEvents = events.filter((event) => event.reason === 'growth')
  const growthsPastHint = overflowEvents.length - growthsAtHint
  const boundedGrowth = overflowEvents.every((event) => event.next <= Math.max(16, event.previous * 2))

  group.clear()
  const beforeReuse = events.filter((event) => event.reason === 'growth').length
  for (let index = 0; index < options.count; index++) group.add(new Sprite2D({ material }))
  group.update()
  const reuseGrowths = events.filter((event) => event.reason === 'growth').length - beforeReuse

  stop()
  group.dispose()
  material.dispose()
  texture.dispose()
  return {
    boundedGrowth,
    growthsPastHint,
    reuseGrowths,
    zeroGrowthToHint: growthsAtHint === initialGrowths,
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

const report = {
  schemaVersion: 1,
  provenance: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    timestamp: new Date().toISOString(),
  },
  options,
  representation: {
    indexAddressed:
      'Index-addressed arrays retain explicitly initialized default/absence slots through the reservation.',
    dense: 'Best-effort engine advisory only; JavaScript has no portable dense-array reserve primitive.',
    gpu: 'No GPU batch is pre-created by expectedSprites.',
  },
  validation: validateLifecycle(),
  hinted: {
    constructionMs: summary(hinted.map((sample) => sample.constructionMs)),
    enrollmentMs: summary(hinted.map((sample) => sample.enrollmentMs)),
    enrollmentGrowths: hinted.map((sample) => sample.enrollmentGrowths),
    checksums: hinted.map((sample) => sample.checksum),
  },
  unhinted: {
    constructionMs: summary(unhinted.map((sample) => sample.constructionMs)),
    enrollmentMs: summary(unhinted.map((sample) => sample.enrollmentMs)),
    enrollmentGrowths: unhinted.map((sample) => sample.enrollmentGrowths),
    checksums: unhinted.map((sample) => sample.checksum),
  },
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
