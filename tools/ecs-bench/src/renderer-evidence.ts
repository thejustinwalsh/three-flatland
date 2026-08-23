import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { cpus, arch, platform, release } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Sprite2D } from '../../../packages/three-flatland/src/sprites/Sprite2D.ts'
import type { Sprite2DOptions } from '../../../packages/three-flatland/src/sprites/types.ts'
import { Sprite2DMaterial } from '../../../packages/three-flatland/src/materials/Sprite2DMaterial.ts'
import {
  createMaterialEffect,
  type MaterialEffect,
} from '../../../packages/three-flatland/src/materials/MaterialEffect.ts'
import { SpriteGroup } from '../../../packages/three-flatland/src/pipeline/SpriteGroup.ts'
import { SpriteBatch } from '../../../packages/three-flatland/src/pipeline/SpriteBatch.ts'
import { select, type World } from '../../../packages/three-flatland/src/ecs/runtime/index.ts'
import { BatchMesh, BatchRegistry, BatchSlot, IsBatched } from '../../../packages/three-flatland/src/ecs/traits.ts'
import type { RegistryData } from '../../../packages/three-flatland/src/ecs/batchUtils.ts'
import { entitySlot, liveStoredEntity } from '../../../packages/three-flatland/src/ecs/snapshot.ts'
import { getSpriteBatchOwnership } from '../../../packages/three-flatland/src/internal/sprite-batch-ownership.ts'
import { getSpriteGroupWorld } from '../../../packages/three-flatland/src/internal/sprite-group-runtime.ts'
import { spriteEntity } from '../../../packages/three-flatland/src/internal/sprite-runtime.ts'
import { gitMergeBase } from './provenance.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
type TextureType = NonNullable<Sprite2DOptions['texture']>
const { Texture } = createRequire(resolve(ROOT, 'packages/three-flatland/package.json'))('three') as {
  Texture: new () => TextureType
}
const BatchRegistries = select(BatchRegistry)

const CASES = [
  'static',
  'moving-alpha-depth',
  'transparent-sort',
  'routing-12000',
  'add-remove-churn',
  'dynamic-effect-churn',
  'mixed-scene',
  'multi-world',
] as const

export type RendererEvidenceCase = (typeof CASES)[number]

export interface RendererEvidenceOptions {
  quick: boolean
  counts: number[]
  warmups: number
  samples: number
  memoryCycles: number
  cases: RendererEvidenceCase[]
  output?: string
}

interface Sample {
  totalMs: number
  systems: Record<string, number>
  owners: OwnerSummary
  heapUsed: number
}

interface TransitionSummary {
  system: string
  operation: string
  calls: number
  compressedBatches: number[]
  batchLocal: boolean
}

interface OwnerSummary {
  worlds: number
  batches: number
  occupiedRows: number
  members: number
}

interface MemoryEvidence {
  gcAvailable: boolean
  status: 'measured' | 'unavailable'
  beforeCreate?: number
  active?: number
  peak?: number
  afterDestroy?: number
  retainedDelta?: number
  cycles?: Array<{ active: number; afterDestroy: number; retainedDelta: number }>
}

interface CaseResult {
  case: RendererEvidenceCase
  count: number
  initialBatches: {
    actual: number
    expected: number
    mode: 'quick-fixed' | 'tier-ladder'
  }
  samples: Sample[]
  summary: {
    totalMs: Statistics
    systems: Record<string, Statistics>
  }
  topology: TransitionSummary[]
  memory: MemoryEvidence
}

interface Statistics {
  median: number
  p95: number
}

export interface RendererEvidenceReport {
  schemaVersion: 1
  status: {
    observation: 'smoke-measured' | 'measured-unreviewed'
    definitiveCapture: 'pending'
    peak60000: 'pending' | 'measured-unreviewed'
  }
  configuration: RendererEvidenceOptions
  provenance: ReturnType<typeof captureProvenance>
  cases: CaseResult[]
}

type BufferOperation = 'writeMatrix' | 'markMatrixDirty' | 'syncCount' | 'flushDirtyRanges' | 'swapSlots'

interface ProbeEvent {
  time: number
  batch: number
  operation: BufferOperation
}

interface RuntimeContext {
  groups: SpriteGroup[]
  worlds: World[]
  sprites: Sprite2D[][]
  materials: Sprite2DMaterial[]
  textures: TextureType[]
  effects: Array<Array<InstanceType<typeof EvidenceEffect> | null>>
  tick: number
  expectedInitialBatches: number
  batchingMode: 'quick-fixed' | 'tier-ladder'
}

interface Scenario {
  readonly name: RendererEvidenceCase
  create(count: number, quick: boolean): RuntimeContext
  mutate(context: RuntimeContext): void
}

export interface RendererEvidenceHooks {
  beforeTimedUpdate?(state: { probeActive: boolean }): void
  beforeAfterDestroyHeap?(state: {
    probeActive: boolean
    probeEvents: number
    topologySummaries: number
    samples: number
    performanceMeasures: number
  }): void
}

const EvidenceEffect = createMaterialEffect({
  name: 'rendererEvidencePulse',
  schema: { strength: 0 },
  node: ({ inputColor }) => inputColor,
})

class BatchBufferProbe {
  readonly events: ProbeEvent[] = []
  private readonly batchIds = new WeakMap<SpriteBatch, number>()
  private readonly watchedOwnership = new Set<object>()
  private nextBatchId = 0
  private active = false
  private restorers: Array<() => void> = []
  private ownershipRestorers: Array<() => void> = []

  install(): void {
    for (const operation of ['writeMatrix', 'markMatrixDirty', 'syncCount', 'flushDirtyRanges'] as const) {
      const prototype = SpriteBatch.prototype as unknown as Record<string, unknown>
      const original = prototype[operation]
      if (typeof original !== 'function') throw new Error(`Missing SpriteBatch.${operation} probe boundary`)
      const originalFunction = original as (...args: unknown[]) => unknown
      const watch = (batch: SpriteBatch): void => this.watchBatchIfActive(batch)
      const record = (batch: SpriteBatch): void => this.record(batch, operation)
      Object.defineProperty(prototype, operation, {
        configurable: true,
        value: function (this: SpriteBatch, ...args: unknown[]): unknown {
          if (operation === 'syncCount') watch(this)
          record(this)
          return Reflect.apply(originalFunction, this, args)
        },
        writable: true,
      })
      this.restorers.push(() => {
        Object.defineProperty(prototype, operation, {
          configurable: true,
          value: original,
          writable: true,
        })
      })
    }
  }

  start(): void {
    this.events.length = 0
    this.active = true
  }

  watchWorlds(worlds: readonly World[]): void {
    for (const world of worlds) {
      const registry = registryFor(world)
      for (const batchEntity of registry.activeBatches) {
        const batch = world.read(batchEntity, BatchMesh)?.mesh
        if (batch) this.watchBatch(batch)
      }
    }
  }

  stop(): void {
    this.active = false
  }

  clear(): void {
    this.events.length = 0
  }

  get isActive(): boolean {
    return this.active
  }

  dispose(): void {
    this.stop()
    this.releaseOwnership()
    for (let index = this.restorers.length - 1; index >= 0; index--) this.restorers[index]!()
    this.restorers.length = 0
  }

  releaseOwnership(): void {
    for (let index = this.ownershipRestorers.length - 1; index >= 0; index--) {
      this.ownershipRestorers[index]!()
    }
    this.ownershipRestorers.length = 0
    this.watchedOwnership.clear()
  }

  private record(batch: SpriteBatch, operation: BufferOperation): void {
    if (!this.active) return
    let id = this.batchIds.get(batch)
    if (id === undefined) {
      id = this.nextBatchId++
      this.batchIds.set(batch, id)
    }
    this.events.push({ batch: id, operation, time: performance.now() })
  }

  private watchBatch(batch: SpriteBatch): void {
    const ownership = getSpriteBatchOwnership(batch)
    if (this.watchedOwnership.has(ownership)) return
    this.watchedOwnership.add(ownership)
    const descriptor = Object.getOwnPropertyDescriptor(ownership, 'swapSlots')
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw new Error('SpriteBatch ownership has no patchable swapSlots boundary')
    }
    const original = descriptor.value as (...args: unknown[]) => unknown
    const record = (): void => this.record(batch, 'swapSlots')
    ownership.swapSlots = function (left: number, right: number): void {
      record()
      Reflect.apply(original, ownership, [left, right])
    }
    this.ownershipRestorers.push(() => {
      Object.defineProperty(ownership, 'swapSlots', descriptor)
    })
  }

  private watchBatchIfActive(batch: SpriteBatch): void {
    if (this.active) this.watchBatch(batch)
  }
}

function createTexture(): TextureType {
  const texture = new Texture()
  texture.image = { width: 16, height: 16 }
  return texture
}

function addInChunks(group: SpriteGroup, sprites: readonly Sprite2D[]): void {
  const chunkSize = 1024
  for (let start = 0; start < sprites.length; start += chunkSize) {
    group.add(...sprites.slice(start, start + chunkSize))
  }
}

function quickBatchSize(count: number): number {
  return Math.max(8, Math.ceil(count / 4))
}

function expectedRunBatches(count: number, quick: boolean): number {
  if (count === 0) return 0
  return Math.ceil(count / (quick ? quickBatchSize(count) : 16_384))
}

function createGroup(
  count: number,
  quick: boolean,
  materialOptions: ConstructorParameters<typeof Sprite2DMaterial>[0] = {},
  withEffect = false
): RuntimeContext {
  const texture = createTexture()
  const material = new Sprite2DMaterial({ ...materialOptions, map: texture })
  if (withEffect) material.registerEffect(EvidenceEffect as unknown as typeof MaterialEffect)
  // Canonical evidence must exercise SpriteGroup exactly as users construct
  // it, including the tier ladder. Quick mode deliberately forces several
  // tiny batches so a 64-sprite smoke can still prove traversal locality.
  const group = quick ? new SpriteGroup({ maxBatchSize: quickBatchSize(count) }) : new SpriteGroup()
  const sprites = Array.from({ length: count }, (_, index) => {
    const sprite = new Sprite2D({ material, texture, zIndex: index })
    sprite.position.set(index % 256, Math.floor(index / 256), 0)
    return sprite
  })
  addInChunks(group, sprites)
  group.update()
  return {
    effects: [Array.from({ length: count }, () => null)],
    batchingMode: quick ? 'quick-fixed' : 'tier-ladder',
    expectedInitialBatches: expectedRunBatches(count, quick),
    groups: [group],
    materials: [material],
    sprites: [sprites],
    textures: [texture],
    tick: 0,
    worlds: [getSpriteGroupWorld(group) as World],
  }
}

function createMixed(count: number, quick: boolean): RuntimeContext {
  const context = createGroup(Math.ceil(count / 2), quick, { alphaTest: 0.5 })
  const texture = createTexture()
  const material = new Sprite2DMaterial({ map: texture })
  const moving = Array.from({ length: Math.floor(count / 2) }, (_, index) => {
    const sprite = new Sprite2D({ material, texture, sortLayer: 1, zIndex: index })
    sprite.position.set(index % 128, Math.floor(index / 128), 0)
    return sprite
  })
  addInChunks(context.groups[0]!, moving)
  context.groups[0]!.update()
  context.sprites[0]!.push(...moving)
  context.materials.push(material)
  context.textures.push(texture)
  context.effects[0]!.push(...Array.from({ length: moving.length }, () => null))
  context.expectedInitialBatches += expectedRunBatches(moving.length, quick)
  return context
}

function createMultiWorld(count: number, quick: boolean): RuntimeContext {
  const firstCount = Math.ceil(count / 2)
  const first = createGroup(firstCount, quick, { alphaTest: 0.5 })
  const second = createGroup(count - firstCount, quick)
  return {
    effects: [...first.effects, ...second.effects],
    batchingMode: quick ? 'quick-fixed' : 'tier-ladder',
    expectedInitialBatches: first.expectedInitialBatches + second.expectedInitialBatches,
    groups: [...first.groups, ...second.groups],
    materials: [...first.materials, ...second.materials],
    sprites: [...first.sprites, ...second.sprites],
    textures: [...first.textures, ...second.textures],
    tick: 0,
    worlds: [...first.worlds, ...second.worlds],
  }
}

function moveSprites(sprites: readonly Sprite2D[], tick: number, sorted: boolean): void {
  for (let index = 0; index < sprites.length; index++) {
    const sprite = sprites[index]!
    sprite.position.x += (index & 1) === 0 ? 0.25 : -0.25
    sprite.position.y += (index & 2) === 0 ? 0.125 : -0.125
    sprite.alpha = 0.5 + ((index + tick) % 50) / 100
    if (sorted) sprite.zIndex = (tick & 1) === 0 ? index : sprites.length - index
  }
}

const scenarios: Record<RendererEvidenceCase, Scenario> = {
  static: {
    name: 'static',
    create: (count, quick) => createGroup(count, quick, { alphaTest: 0.5 }),
    mutate: (context) => {
      context.tick++
    },
  },
  'moving-alpha-depth': {
    name: 'moving-alpha-depth',
    create: (count, quick) => createGroup(count, quick, { alphaTest: 0.5 }),
    mutate: (context) => moveSprites(context.sprites[0]!, ++context.tick, false),
  },
  'transparent-sort': {
    name: 'transparent-sort',
    create: (count, quick) => createGroup(count, quick),
    mutate: (context) => moveSprites(context.sprites[0]!, ++context.tick, true),
  },
  'routing-12000': {
    name: 'routing-12000',
    create: (count, quick) => createGroup(count, quick),
    mutate: (context) => {
      const sprites = context.sprites[0]!
      const changed = Math.min(12_000, sprites.length)
      const tick = ++context.tick
      for (let index = 0; index < changed; index++) sprites[index]!.sortLayer = (index + tick) & 1
    },
  },
  'add-remove-churn': {
    name: 'add-remove-churn',
    create: (count, quick) => createGroup(count, quick),
    mutate: (context) => {
      const group = context.groups[0]!
      const sprites = context.sprites[0]!
      const material = context.materials[0]!
      const texture = context.textures[0]!
      const churn = Math.max(1, Math.floor(sprites.length * 0.1))
      const removed = sprites.splice(0, churn)
      for (const sprite of removed) {
        group.remove(sprite)
        sprite.dispose()
      }
      const replacements = Array.from({ length: churn }, (_, index) => {
        const sprite = new Sprite2D({ material, texture, zIndex: context.tick + index })
        sprite.position.set((context.tick + index) % 256, index % 128, 0)
        return sprite
      })
      addInChunks(group, replacements)
      sprites.push(...replacements)
      context.tick++
    },
  },
  'dynamic-effect-churn': {
    name: 'dynamic-effect-churn',
    create: (count, quick) => createGroup(count, quick, {}, true),
    mutate: (context) => {
      const sprites = context.sprites[0]!
      const effects = context.effects[0]!
      const churn = Math.max(1, Math.floor(sprites.length * 0.1))
      const start = (context.tick * churn) % sprites.length
      for (let offset = 0; offset < churn; offset++) {
        const index = (start + offset) % sprites.length
        const existing = effects[index]
        if (existing) {
          sprites[index]!.removeEffect(existing)
          effects[index] = null
        } else {
          const effect = new EvidenceEffect()
          effect.strength = ((index + context.tick) % 100) / 100
          sprites[index]!.addEffect(effect)
          effects[index] = effect
        }
      }
      context.tick++
    },
  },
  'mixed-scene': {
    name: 'mixed-scene',
    create: createMixed,
    mutate: (context) => {
      const sprites = context.sprites[0]!
      moveSprites(sprites.slice(Math.ceil(sprites.length / 2)), ++context.tick, true)
    },
  },
  'multi-world': {
    name: 'multi-world',
    create: createMultiWorld,
    mutate: (context) => {
      context.tick++
      moveSprites(context.sprites[0]!, context.tick, false)
      moveSprites(context.sprites[1]!, context.tick, true)
    },
  },
}

function update(context: RuntimeContext): void {
  for (const group of context.groups) group.update()
}

function disposeContext(context: RuntimeContext): void {
  let firstError: unknown
  let didError = false
  for (const group of context.groups) {
    try {
      group.dispose()
    } catch (error) {
      if (!didError) {
        firstError = error
        didError = true
      }
    }
  }
  for (const material of context.materials) material.dispose()
  for (const texture of context.textures) texture.dispose()
  context.groups.length = 0
  context.worlds.length = 0
  context.sprites.length = 0
  context.materials.length = 0
  context.textures.length = 0
  context.effects.length = 0
  if (didError) throw firstError
}

function registryFor(world: World): RegistryData {
  const entity = world.view(BatchRegistries)[0]
  if (entity === undefined) throw new Error('Renderer evidence world has no BatchRegistry')
  const registry = world.read(entity, BatchRegistry)
  if (!registry) throw new Error('Renderer evidence BatchRegistry is unreadable')
  return registry as RegistryData
}

function initialBatchCounts(context: RuntimeContext): CaseResult['initialBatches'] {
  let actual = 0
  for (const world of context.worlds) actual += registryFor(world).activeBatches.length
  if (actual !== context.expectedInitialBatches) {
    throw new Error(
      `Initial committed batch count mismatch (${context.batchingMode}): expected ${context.expectedInitialBatches}, received ${actual}`
    )
  }
  return { actual, expected: context.expectedInitialBatches, mode: context.batchingMode }
}

function validateOwners(worlds: readonly World[]): OwnerSummary {
  const summary: OwnerSummary = { batches: 0, members: 0, occupiedRows: 0, worlds: worlds.length }
  for (const world of worlds) {
    const registry = registryFor(world)
    for (const batchEntity of registry.activeBatches) {
      const mesh = world.read(batchEntity, BatchMesh)?.mesh
      if (!mesh) throw new Error(`Batch ${batchEntity} has no mesh`)
      const ownership = getSpriteBatchOwnership(mesh)
      let occupied = 0
      for (let slot = 0; slot < ownership.slotSpan(); slot++) {
        const packed = ownership.slotEntities[slot] ?? 0
        if (packed === 0) continue
        occupied++
        const owner = liveStoredEntity(world, packed)
        if (owner === null) throw new Error(`Batch ${batchEntity} slot ${slot} has stale owner ${packed}`)
        if (!world.has(owner, IsBatched)) throw new Error(`Batch owner ${owner} is missing IsBatched`)
        const stored = world.read(owner, BatchSlot)
        if (!stored || stored.batchEntity !== batchEntity || stored.slot !== slot) {
          throw new Error(`BatchSlot disagrees with batch ${batchEntity} slot ${slot}`)
        }
        const sprite = ownership.spriteAtSlot(slot)
        if (!sprite || spriteEntity(sprite) !== owner || sprite._batchMesh !== mesh || sprite._batchSlot !== slot) {
          throw new Error(`Sprite reference disagrees with batch ${batchEntity} slot ${slot}`)
        }
        if (registry.spriteArr[entitySlot(owner)] !== sprite) {
          throw new Error(`Registry sprite lookup disagrees with owner ${owner}`)
        }
      }
      if (occupied !== mesh.activeCount || occupied !== ownership.memberSpan()) {
        throw new Error(`Batch ${batchEntity} counts disagree: rows=${occupied}, active=${mesh.activeCount}`)
      }
      for (let member = 0; member < ownership.memberSpan(); member++) {
        const sprite = ownership.memberSprites[member]
        const slot = ownership.memberSlotAt(member)
        if (
          !sprite ||
          slot < 0 ||
          ownership.spriteAtSlot(slot) !== sprite ||
          ownership.slotEntities[slot] !== spriteEntity(sprite)
        ) {
          throw new Error(`Batch ${batchEntity} stable member ${member} has no matching physical owner`)
        }
      }
      summary.batches++
      summary.occupiedRows += occupied
      summary.members += ownership.memberSpan()
    }
  }
  return summary
}

function collectSystems(): PerformanceMeasure[] {
  const measures = performance.getEntriesByType('measure') as PerformanceMeasure[]
  if (!measures.some((measure) => measure.name === 'ecs:run')) {
    throw new Error('SystemSchedule timing is unavailable; run a development build or set FL_PROFILE=true')
  }
  return measures
}

function summarizeTransitions(
  events: readonly ProbeEvent[],
  measures: readonly PerformanceMeasure[]
): TransitionSummary[] {
  const systemMeasures = measures.filter((measure) => measure.name !== 'ecs:run')
  const grouped = new Map<string, ProbeEvent[]>()
  for (const event of events) {
    const containing = systemMeasures
      .filter((measure) => event.time >= measure.startTime && event.time <= measure.startTime + measure.duration)
      .sort((left, right) => left.duration - right.duration)[0]
    const system = containing?.name ?? 'outside-system'
    const key = `${system}:${event.operation}`
    const list = grouped.get(key)
    if (list) list.push(event)
    else grouped.set(key, [event])
  }

  const summaries: TransitionSummary[] = []
  for (const [key, group] of grouped) {
    const separator = key.lastIndexOf(':')
    const system = key.slice(0, separator)
    const operation = key.slice(separator + 1)
    const compressed: number[] = []
    for (const event of group) {
      if (compressed[compressed.length - 1] !== event.batch) compressed.push(event.batch)
    }
    const visited = new Set<number>()
    let batchLocal = true
    for (const batch of compressed) {
      if (visited.has(batch)) batchLocal = false
      visited.add(batch)
    }
    const mustStayBatchLocal = system === 'transformSync' || system === 'batchSort' || system === 'flushDirtyRanges'
    if (mustStayBatchLocal && !batchLocal) {
      throw new Error(`${system}/${operation} revisited a prior batch: ${compressed.join(', ')}`)
    }
    summaries.push({ batchLocal, calls: group.length, compressedBatches: compressed, operation, system })
  }
  return summaries.sort((left, right) =>
    `${left.system}:${left.operation}`.localeCompare(`${right.system}:${right.operation}`)
  )
}

function systemDurations(measures: readonly PerformanceMeasure[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const measure of measures) totals[measure.name] = (totals[measure.name] ?? 0) + measure.duration
  return totals
}

function statistic(values: readonly number[]): Statistics {
  const sorted = [...values].sort((left, right) => left - right)
  const percentile = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!
  return { median: percentile(0.5), p95: percentile(0.95) }
}

function summarizeSamples(samples: readonly Sample[]): CaseResult['summary'] {
  const names = new Set(samples.flatMap((sample) => Object.keys(sample.systems)))
  const systems: Record<string, Statistics> = {}
  for (const name of names) systems[name] = statistic(samples.map((sample) => sample.systems[name] ?? 0))
  return { systems, totalMs: statistic(samples.map((sample) => sample.totalMs)) }
}

function forceGc(): boolean {
  if (typeof globalThis.gc !== 'function') return false
  globalThis.gc()
  globalThis.gc()
  return true
}

function clearPerformanceEntries(): void {
  performance.clearMarks()
  performance.clearMeasures()
}

async function measureCase(
  scenario: Scenario,
  count: number,
  options: RendererEvidenceOptions,
  hooks?: RendererEvidenceHooks
): Promise<CaseResult> {
  clearPerformanceEntries()
  const gcAvailable = forceGc()
  let memory: MemoryEvidence = { gcAvailable, status: 'unavailable' }

  if (gcAvailable) {
    let beforeCreate = 0
    let active = 0
    let afterDestroy = 0
    let peak = 0
    const memoryCycles: Array<{ active: number; afterDestroy: number; retainedDelta: number }> = []
    for (let cycle = 0; cycle < options.memoryCycles; cycle++) {
      clearPerformanceEntries()
      forceGc()
      const cycleBefore = process.memoryUsage().heapUsed
      if (cycle === 0) beforeCreate = cycleBefore

      const memoryContext = scenario.create(count, options.quick)
      initialBatchCounts(memoryContext)
      scenario.mutate(memoryContext)
      update(memoryContext)
      clearPerformanceEntries()
      peak = Math.max(peak, process.memoryUsage().heapUsed)
      forceGc()
      const cycleActive = process.memoryUsage().heapUsed
      if (cycle === 0) active = cycleActive

      disposeContext(memoryContext)
      clearPerformanceEntries()
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise))
      hooks?.beforeAfterDestroyHeap?.({
        performanceMeasures: performance.getEntriesByType('measure').length,
        probeActive: false,
        probeEvents: 0,
        samples: 0,
        topologySummaries: 0,
      })
      forceGc()
      afterDestroy = process.memoryUsage().heapUsed
      memoryCycles.push({
        active: cycleActive,
        afterDestroy,
        retainedDelta: afterDestroy - cycleBefore,
      })
    }
    memory = {
      active,
      afterDestroy,
      beforeCreate,
      cycles: memoryCycles,
      gcAvailable,
      peak,
      retainedDelta: afterDestroy - beforeCreate,
      status: 'measured',
    }
  }

  // Timing and topology use a second context so report allocations and User
  // Timing entries cannot be retained by the memory lifecycle above.
  const context = scenario.create(count, options.quick)
  const initialBatches = initialBatchCounts(context)

  // Topology validation is intentionally a separate, unreported frame. The
  // temporary wrappers prove batch-local traversal, then are fully removed
  // before either timing or retained-heap observations begin.
  const probe = new BatchBufferProbe()
  let topology: TransitionSummary[] = []
  probe.install()
  try {
    scenario.mutate(context)
    probe.watchWorlds(context.worlds)
    clearPerformanceEntries()
    probe.start()
    update(context)
    probe.stop()
    topology = summarizeTransitions(probe.events, collectSystems())
    validateOwners(context.worlds)
  } finally {
    probe.stop()
    probe.releaseOwnership()
    probe.clear()
    probe.dispose()
    clearPerformanceEntries()
  }

  const samples: Sample[] = []

  try {
    for (let index = 0; index < options.warmups; index++) {
      scenario.mutate(context)
      update(context)
    }
    for (let index = 0; index < options.samples; index++) {
      scenario.mutate(context)
      clearPerformanceEntries()
      hooks?.beforeTimedUpdate?.({ probeActive: probe.isActive })
      const start = performance.now()
      update(context)
      const totalMs = performance.now() - start
      const measures = collectSystems()
      const owners = validateOwners(context.worlds)
      const heapUsed = process.memoryUsage().heapUsed
      samples.push({
        heapUsed,
        owners,
        systems: systemDurations(measures),
        totalMs,
      })
    }
  } finally {
    disposeContext(context)
    clearPerformanceEntries()
  }
  return {
    case: scenario.name,
    count,
    initialBatches,
    memory,
    samples,
    summary: summarizeSamples(samples),
    topology,
  }
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function sourceFiles(): string[] {
  const roots = ['packages/three-flatland/src/ecs/runtime', 'packages/three-flatland/src/ecs/systems']
  const files = [
    'packages/three-flatland/src/pipeline/SpriteGroup.ts',
    'packages/three-flatland/src/pipeline/SpriteBatch.ts',
    'packages/three-flatland/src/pipeline/SpriteSpatialGrid.ts',
    'packages/three-flatland/src/pipeline/BucketedDirtyTracker.ts',
    'packages/three-flatland/src/ecs/SystemSchedule.ts',
    'packages/three-flatland/src/ecs/batchUtils.ts',
    'packages/three-flatland/src/ecs/traits.ts',
    'packages/three-flatland/src/ecs/snapshot.ts',
    'packages/three-flatland/src/sprites/Sprite2D.ts',
    'packages/three-flatland/src/materials/Sprite2DMaterial.ts',
    'packages/three-flatland/src/materials/MaterialEffect.ts',
    'packages/three-flatland/src/internal/sprite-batch-ownership.ts',
    'packages/three-flatland/src/internal/max-batch-size.ts',
    'tools/ecs-bench/src/renderer-evidence.ts',
    'tools/ecs-bench/src/provenance.ts',
    'pnpm-lock.yaml',
  ]
  const visit = (directory: string): void => {
    for (const entry of readdirSync(resolve(ROOT, directory))) {
      const path = `${directory}/${entry}`
      const stats = statSync(resolve(ROOT, path))
      if (stats.isDirectory()) visit(path)
      else if (path.endsWith('.ts') && !path.includes('.test.')) files.push(path)
    }
  }
  for (const root of roots) visit(root)
  return [...new Set(files)].sort()
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function captureProvenance() {
  const sources = sourceFiles().map((path) => {
    const bytes = readFileSync(resolve(ROOT, path))
    return { path, sha256: sha256(bytes) }
  })
  return {
    cpu: cpus()[0]?.model ?? 'unknown',
    git: {
      dirty: git('status', '--porcelain').length > 0,
      head: git('rev-parse', 'HEAD'),
      mergeBase: gitMergeBase(),
    },
    node: process.version,
    os: { arch: arch(), platform: platform(), release: release() },
    packages: {
      three: packageVersion('packages/three-flatland/node_modules/three/package.json'),
      threeFlatland: packageVersion('packages/three-flatland/package.json'),
    },
    sourceAggregateSha256: sha256(sources.map(({ path, sha256: hash }) => `${path}:${hash}`).join('\n')),
    sources,
  }
}

function packageVersion(path: string): string {
  const parsed = JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as { version?: unknown }
  if (typeof parsed.version !== 'string') throw new Error(`${path} has no string version`)
  return parsed.version
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${flag} requires a positive safe integer`)
  return parsed
}

export function parseRendererEvidenceArgs(argv: readonly string[]): RendererEvidenceOptions {
  let quick = false
  let include60000 = false
  let count: number | undefined
  let warmups: number | undefined
  let samples: number | undefined
  let memoryCycles: number | undefined
  let output: string | undefined
  let selectedCases: RendererEvidenceCase[] = [...CASES]
  for (const argument of argv) {
    if (argument === '--') continue
    if (argument === '--quick') quick = true
    else if (argument === '--include-60000') include60000 = true
    else if (argument.startsWith('--count=')) count = positiveInteger(argument.slice(8), '--count')
    else if (argument.startsWith('--warmups=')) warmups = positiveInteger(argument.slice(10), '--warmups')
    else if (argument.startsWith('--samples=')) samples = positiveInteger(argument.slice(10), '--samples')
    else if (argument.startsWith('--memory-cycles=')) {
      memoryCycles = positiveInteger(argument.slice(16), '--memory-cycles')
    } else if (argument.startsWith('--output=')) output = argument.slice(9)
    else if (argument.startsWith('--case=')) {
      const name = argument.slice(7)
      if (!CASES.includes(name as RendererEvidenceCase)) throw new Error(`Unknown renderer evidence case: ${name}`)
      selectedCases = [name as RendererEvidenceCase]
    } else if (argument !== '--help') throw new Error(`Unknown argument: ${argument}`)
  }
  const counts = [count ?? (quick ? 64 : 16_384)]
  if (include60000 && !counts.includes(60_000)) counts.push(60_000)
  return {
    cases: selectedCases,
    counts,
    memoryCycles: memoryCycles ?? (quick ? 1 : 3),
    output,
    quick,
    samples: samples ?? (quick ? 1 : 10),
    warmups: warmups ?? (quick ? 1 : 5),
  }
}

export async function runRendererEvidence(
  options: RendererEvidenceOptions,
  hooks?: RendererEvidenceHooks
): Promise<RendererEvidenceReport> {
  const provenance = captureProvenance()
  if (!options.quick && provenance.git.dirty) {
    throw new Error('Definitive renderer evidence requires a clean source tree; commit or stash all changes first')
  }
  const results: CaseResult[] = []
  try {
    for (const count of options.counts) {
      for (const name of options.cases) results.push(await measureCase(scenarios[name], count, options, hooks))
    }
  } finally {
    performance.clearMeasures()
  }
  const report: RendererEvidenceReport = {
    cases: results,
    configuration: options,
    provenance,
    schemaVersion: 1,
    status: {
      definitiveCapture: 'pending',
      observation: options.quick ? 'smoke-measured' : 'measured-unreviewed',
      peak60000: options.counts.includes(60_000) ? 'measured-unreviewed' : 'pending',
    },
  }
  if (options.output) writeFileSync(resolve(process.cwd(), options.output), `${JSON.stringify(report, null, 2)}\n`)
  return report
}

function usage(): string {
  return `Usage: pnpm nx run @three-flatland/ecs-bench:benchmark:renderer --args='[options]'

  --quick             Smoke-sized run (64 sprites, one measured sample)
  --count=N           Override the primary sprite count (default: 16384)
  --include-60000     Add the optional 60,000-sprite memory scale point
  --warmups=N         Override warm-up frames
  --samples=N         Override measured frames
  --memory-cycles=N   Override create/destroy cycles (default: 3; quick: 1)
  --case=NAME         Run one of: ${CASES.join(', ')}
  --output=PATH       Write raw JSON to PATH
  --help              Show this help
`
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--help')) {
    process.stdout.write(usage())
  } else {
    const report = await runRendererEvidence(parseRendererEvidenceArgs(process.argv.slice(2)))
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  }
}
