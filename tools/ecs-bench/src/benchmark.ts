import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { arch, cpus, platform, release } from 'node:os'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { component, type AdapterWorld, type EcsAdapter, type Entity } from './adapter.ts'
import { createFlatlandRuntimeAdapter } from './adapters/flatland-runtime.ts'
import { kootaAdapter } from './adapters/koota.ts'
import { createAnchoredScanAdapter } from './candidates/anchored-scan.ts'
import { createSignaturePersistentAdapter } from './candidates/signature-persistent.ts'
import { createSparsePersistentAdapter } from './candidates/sparse-persistent.ts'
import { gitMergeBase } from './provenance.ts'

interface TimingResult {
  readonly checksum: number
  readonly medianMs: number
  readonly observationsMs: readonly number[]
  readonly p95Ms: number
  readonly samples: number
  readonly warmups: number
}

interface WorkloadResult extends TimingResult {
  readonly operationsPerSample: number
}

interface AdapterResult {
  readonly memory: MemoryResult
  readonly name: string
  readonly workloads: Readonly<Record<string, WorkloadResult>>
}

interface MemoryResult {
  readonly activeHeapDeltaBytes: MemorySamples
  readonly entityCount: number
  readonly retainedHeapDeltaBytes: MemorySamples
  readonly samples: number
  readonly warmups: number
}

interface MemorySamples {
  readonly median: number
  readonly observations: readonly number[]
  readonly p95: number
}

const quick = process.argv.includes('--quick')
const requestedAdapter = process.argv.find((value) => value.startsWith('--adapter='))?.slice(10)
const outputPath = process.argv.find((value) => value.startsWith('--output='))?.slice(9)
const require = createRequire(import.meta.url)

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!
}

function summarizeMemory(values: readonly number[]): MemorySamples {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    median: percentile(sorted, 0.5),
    observations: values,
    p95: percentile(sorted, 0.95),
  }
}

function measure(
  run: (sample: number) => number,
  { samples, warmups }: { readonly samples: number; readonly warmups: number }
): TimingResult {
  let checksum = 2_166_136_261
  for (let index = 0; index < warmups; index++) run(-(index + 1))

  const observations: number[] = []
  for (let index = 0; index < samples; index++) {
    const start = performance.now()
    const value = run(index)
    observations.push(performance.now() - start)
    checksum = Math.imul(checksum ^ value, 16_777_619) >>> 0
  }

  const sorted = [...observations].sort((left, right) => left - right)
  return {
    checksum,
    medianMs: percentile(sorted, 0.5),
    observationsMs: observations,
    p95Ms: percentile(sorted, 0.95),
    samples,
    warmups,
  }
}

function benchmarkAdapter(adapter: EcsAdapter): AdapterResult {
  const SpriteUV = adapter.numeric({ height: 1, width: 1, x: 0, y: 0 })
  const SpriteColor = adapter.numeric({ a: 1, b: 1, g: 1, r: 1 })
  const SpriteFlip = adapter.numeric({ x: 0, y: 0 })
  const SortLayer = adapter.numeric({ value: 0 })
  const SpriteZIndex = adapter.numeric({ value: 0 })
  const SpriteMaterialRef = adapter.numeric({ value: 0 })
  const CameraLayersMask = adapter.numeric({ value: 1 })
  const IsRenderable = adapter.tag()
  const IsBatched = adapter.tag()
  const DynamicEffect = adapter.numeric({ radius: 0, strength: 1 })
  // Model long-lived editor/HMR declaration history before per-world dynamic
  // effects. These traits are intentionally never attached in this adapter run.
  Array.from({ length: 512 }, () => adapter.tag())
  const DynamicEffectTraits = Array.from({ length: 256 }, () => adapter.numeric({ radius: 0, strength: 1 }))
  const AssignedTo = adapter.exclusive()
  const BatchedSprites = adapter.select(IsBatched, SpriteUV)
  const DynamicSprites = adapter.select(DynamicEffect)
  const RoutingChanges = adapter.event('changed', [SortLayer, SpriteMaterialRef, CameraLayersMask], [IsBatched])

  const baseComponents = [
    component(SpriteUV),
    component(SpriteColor),
    component(SpriteFlip),
    component(SortLayer),
    component(SpriteZIndex),
    component(SpriteMaterialRef),
    component(CameraLayersMask),
    component(IsRenderable),
    component(IsBatched),
  ]

  function spawnBase(world: AdapterWorld, count: number): Entity[] {
    const entities: Entity[] = []
    for (let index = 0; index < count; index++) entities.push(world.spawn(...baseComponents))
    return entities
  }

  const workloads: Record<string, WorkloadResult> = {}

  const memoryCount = quick ? 2_048 : 60_000
  const memoryPolicy = { samples: quick ? 3 : 7, warmups: quick ? 1 : 2 }

  function captureActiveMemory(): { active: number; heapBefore: number } {
    globalThis.gc?.()
    const heapBefore = process.memoryUsage().heapUsed
    const memoryWorld = adapter.createWorld()
    spawnBase(memoryWorld, memoryCount)
    memoryWorld.view(BatchedSprites)
    globalThis.gc?.()
    const active = process.memoryUsage().heapUsed - heapBefore
    memoryWorld.dispose()
    return { active, heapBefore }
  }

  function captureMemory(): { active: number; retained: number } {
    const { active, heapBefore } = captureActiveMemory()
    globalThis.gc?.()
    return { active, retained: process.memoryUsage().heapUsed - heapBefore }
  }

  for (let index = 0; index < memoryPolicy.warmups; index++) captureMemory()
  const memoryObservations = Array.from({ length: memoryPolicy.samples }, captureMemory)
  const memory = {
    activeHeapDeltaBytes: summarizeMemory(memoryObservations.map(({ active }) => active)),
    entityCount: memoryCount,
    retainedHeapDeltaBytes: summarizeMemory(memoryObservations.map(({ retained }) => retained)),
    ...memoryPolicy,
  }

  const record = (
    name: string,
    operationsPerSample: number,
    run: (sample: number) => number,
    policy = { samples: quick ? 3 : 15, warmups: quick ? 1 : 5 }
  ): void => {
    workloads[name] = { operationsPerSample, ...measure(run, policy) }
  }

  for (const count of quick ? [1_000] : [1_000, 16_384, 60_000]) {
    record(
      `lifecycle-${count}`,
      count * 2,
      () => {
        const world = adapter.createWorld()
        const entities = spawnBase(world, count)
        let checksum = 0
        for (const entity of entities) {
          checksum ^= world.index(entity)
          world.destroy(entity)
        }
        world.dispose()
        return checksum
      },
      { samples: quick ? 2 : count === 60_000 ? 5 : 10, warmups: quick ? 1 : 3 }
    )
  }

  for (const count of quick ? [1_000] : [12_000, 60_000]) {
    record(
      `dynamic-effect-lifecycle-${count}`,
      count * 2,
      () => {
        const world = adapter.createWorld()
        const entities: Entity[] = []
        for (let index = 0; index < count; index++) {
          const effect = DynamicEffectTraits[index % DynamicEffectTraits.length]!
          entities.push(world.spawn(...baseComponents, component(effect, { strength: index })))
        }
        let checksum = 0
        for (const entity of entities) {
          checksum ^= world.index(entity)
          world.destroy(entity)
        }
        world.dispose()
        return checksum
      },
      { samples: quick ? 2 : count === 60_000 ? 5 : 10, warmups: quick ? 1 : 3 }
    )
  }

  {
    const count = quick ? 2_048 : 16_384
    const world = adapter.createWorld()
    const entities = spawnBase(world, count)
    const entityIndices = entities.map((entity) => world.index(entity))
    const uv = world.store(SpriteUV)
    const color = world.store(SpriteColor)
    const uvX = uv.x
    const uvY = uv.y
    const uvWidth = uv.width
    const uvHeight = uv.height
    const colorR = color.r
    const colorG = color.g
    const colorB = color.b
    const colorA = color.a
    record('direct-store-hot', count * 12, (sample) => {
      let checksum = 0
      for (const index of entityIndices) {
        uvX[index] = sample + index
        uvY[index] = index * 0.5
        uvWidth[index] = 16
        uvHeight[index] = 16
        colorR[index] = 1
        colorG[index] = 0.5
        colorB[index] = 0.25
        colorA[index] = 1
        checksum += uvX[index]! + colorA[index]!
      }
      return checksum | 0
    })
    world.dispose()
  }

  {
    const count = quick ? 2_048 : 16_384
    const iterations = quick ? 100 : 1_000
    const world = adapter.createWorld()
    spawnBase(world, count)
    record('stable-query-retrieval', iterations, () => {
      let total = 0
      for (let index = 0; index < iterations; index++) total += world.view(BatchedSprites).length
      if (total !== count * iterations) throw new Error('Stable selector retrieval returned the wrong entity count')
      return total
    })
    record('stable-query-iteration', count * iterations, () => {
      let total = 0
      let visited = 0
      for (let iteration = 0; iteration < iterations; iteration++) {
        for (const entity of world.view(BatchedSprites)) {
          total = (total + entity) | 0
          visited++
        }
      }
      if (visited !== count * iterations) throw new Error('Stable selector iteration visited the wrong entity count')
      return total | 0
    })
    world.dispose()
  }

  {
    const count = quick ? 2_048 : 12_000
    const world = adapter.createWorld()
    const entities = spawnBase(world, count)
    record('dynamic-structural-churn', count * 2, () => {
      for (const entity of entities) world.add(entity, component(DynamicEffect))
      const afterAdd = world.view(DynamicSprites).length
      for (const entity of entities) world.remove(entity, DynamicEffect)
      if (afterAdd !== count || world.view(DynamicSprites).length !== 0) {
        throw new Error('Dynamic selector membership did not track structural churn')
      }
      return afterAdd
    })
    world.dispose()
  }

  {
    const count = quick ? 2_048 : 12_000
    const world = adapter.createWorld()
    const entities = spawnBase(world, count)
    const indices = entities.map((entity) => world.index(entity))
    const sortLayers = world.store(SortLayer).value
    const materialRefs = world.store(SpriteMaterialRef).value
    const cameraMasks = world.store(CameraLayersMask).value
    world.drain(RoutingChanges)
    record('routing-events', count * 3, (sample) => {
      for (let position = 0; position < entities.length; position++) {
        const entity = entities[position]!
        const index = indices[position]!
        sortLayers[index] = sample
        materialRefs[index] = sample + 1
        cameraMasks[index] = sample + 2
        world.touch(entity, SortLayer)
        world.touch(entity, SpriteMaterialRef)
        world.touch(entity, CameraLayersMask)
      }
      const routed = world.drain(RoutingChanges).length
      if (routed !== count) throw new Error('Routing changes were not deduplicated to one event per entity')
      return routed
    })
    world.dispose()
  }

  {
    const count = quick ? 2_048 : 12_000
    const world = adapter.createWorld()
    const firstBatch = world.spawn()
    const secondBatch = world.spawn()
    const entities = spawnBase(world, count)
    record('exclusive-assignment', count * 5, (sample) => {
      let checksum = 0
      const target = sample % 2 === 0 ? firstBatch : secondBatch
      for (const entity of entities) {
        world.assign(entity, AssignedTo, target)
        const assigned = world.target(entity, AssignedTo)
        if (assigned !== target) throw new Error('Exclusive assignment did not retain its target')
        checksum ^= assigned
        world.unassign(entity, AssignedTo)
        if (world.target(entity, AssignedTo) !== undefined) {
          throw new Error('Exclusive assignment did not clear its target')
        }
      }
      return checksum
    })
    world.dispose()
  }

  adapter.reset()
  return { memory, name: adapter.name, workloads }
}

const rootPackage = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../package.json'), 'utf8')) as {
  packageManager: string
}
const kootaPackage = JSON.parse(
  readFileSync(resolve(dirname(require.resolve('koota')), '../package.json'), 'utf8')
) as { version: string }
const tsxPackage = JSON.parse(readFileSync(resolve(dirname(require.resolve('tsx')), '../package.json'), 'utf8')) as {
  version: string
}

const harnessSources = [
  'adapter.ts',
  'adapters/flatland-runtime.ts',
  'adapters/koota.ts',
  'candidates/anchored-scan.ts',
  'candidates/shared.ts',
  'candidates/signature-persistent.ts',
  'candidates/sparse-persistent.ts',
  'provenance.ts',
  'benchmark.ts',
  '../../../packages/three-flatland/src/ecs/runtime/entity.ts',
  '../../../packages/three-flatland/src/ecs/runtime/index.ts',
  '../../../packages/three-flatland/src/ecs/runtime/selector.ts',
  '../../../packages/three-flatland/src/ecs/runtime/sparse-set.ts',
  '../../../packages/three-flatland/src/ecs/runtime/trait.ts',
  '../../../packages/three-flatland/src/ecs/runtime/world.ts',
] as const
const harnessHash = createHash('sha256')
for (const source of harnessSources) {
  harnessHash.update(source)
  harnessHash.update(readFileSync(resolve(import.meta.dirname, source)))
}

const environment = {
  architecture: arch(),
  cpu: cpus()[0]?.model ?? 'unknown',
  harnessSha256: harnessHash.digest('hex'),
  harnessSources,
  koota: kootaPackage.version,
  mergeBase: gitMergeBase(),
  node: process.version,
  operatingSystem: `${platform()} ${release()}`,
  packageManager: rootPackage.packageManager,
  tsx: tsxPackage.version,
}

const adapterFactories: Readonly<Record<string, () => EcsAdapter>> = {
  'anchored-scan': createAnchoredScanAdapter,
  'flatland-runtime': createFlatlandRuntimeAdapter,
  koota: () => kootaAdapter,
  'signature-persistent': createSignaturePersistentAdapter,
  'sparse-persistent': createSparsePersistentAdapter,
}

function isolatedResult(name: string): AdapterResult {
  // tsx 4.21 still uses Node's deprecated module.register hook internally.
  // Suppress that one upstream warning so isolated benchmark output remains
  // machine-readable on Node 26 without hiding any other warning category.
  const args = [
    '--disable-warning=DEP0205',
    '--import',
    'tsx',
    '--expose-gc',
    import.meta.filename,
    `--adapter=${name}`,
  ]
  if (quick) args.push('--quick')
  const childReport = JSON.parse(
    execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 })
  ) as { results: AdapterResult[] }
  const result = childReport.results[0]
  if (result === undefined) throw new Error(`Isolated benchmark produced no result for ${name}`)
  return result
}

function aggregateAdapterResults(runs: readonly AdapterResult[]): AdapterResult {
  const first = runs[0]
  if (first === undefined) throw new Error('Cannot aggregate an empty adapter run set')

  const workloads: Record<string, WorkloadResult> = {}
  for (const [name, firstWorkload] of Object.entries(first.workloads)) {
    const runWorkloads = runs.map((run) => run.workloads[name]!)
    const observations = runWorkloads.flatMap((workload) => workload.observationsMs)
    const sorted = [...observations].sort((left, right) => left - right)
    let checksum = 2_166_136_261
    for (const workload of runWorkloads) {
      checksum = Math.imul(checksum ^ workload.checksum, 16_777_619) >>> 0
    }
    workloads[name] = {
      checksum,
      medianMs: percentile(sorted, 0.5),
      observationsMs: observations,
      operationsPerSample: firstWorkload.operationsPerSample,
      p95Ms: percentile(sorted, 0.95),
      samples: runWorkloads.reduce((sum, workload) => sum + workload.samples, 0),
      warmups: runWorkloads.reduce((sum, workload) => sum + workload.warmups, 0),
    }
  }

  const activeObservations = runs.flatMap((run) => run.memory.activeHeapDeltaBytes.observations)
  const retainedObservations = runs.flatMap((run) => run.memory.retainedHeapDeltaBytes.observations)
  return {
    memory: {
      activeHeapDeltaBytes: summarizeMemory(activeObservations),
      entityCount: first.memory.entityCount,
      retainedHeapDeltaBytes: summarizeMemory(retainedObservations),
      samples: runs.reduce((sum, run) => sum + run.memory.samples, 0),
      warmups: runs.reduce((sum, run) => sum + run.memory.warmups, 0),
    },
    name: first.name,
    workloads,
  }
}

let results: AdapterResult[]
const processesPerAdapter = requestedAdapter === undefined && !quick ? 3 : 1
if (requestedAdapter === undefined) {
  results = Object.keys(adapterFactories).map((name) =>
    aggregateAdapterResults(Array.from({ length: processesPerAdapter }, () => isolatedResult(name)))
  )
} else {
  const factory = adapterFactories[requestedAdapter]
  if (factory === undefined) throw new Error(`Unknown adapter: ${requestedAdapter}`)
  results = [benchmarkAdapter(factory())]
}

const report = {
  schemaVersion: 2,
  environment,
  methodology: {
    adapterIsolation: `${processesPerAdapter} fresh Node process${processesPerAdapter === 1 ? '' : 'es'} per adapter with explicit garbage collection available.`,
    checksumPolicy: 'Every timed sample contributes to a non-cancelling aggregate checksum.',
    memory:
      'Each observation measures a fresh world; active heap is sampled before disposal and retained heap after the capture frame returns and garbage collection runs.',
    timing: 'performance.now() wall-clock milliseconds; raw observations, median, and p95 are retained.',
  },
  mode: quick ? 'quick' : 'full',
  processesPerAdapter,
  results,
}
const serialized = `${JSON.stringify(report, null, 2)}\n`
if (outputPath === undefined) {
  process.stdout.write(serialized)
} else {
  const absoluteOutputPath = resolve(process.cwd(), outputPath)
  mkdirSync(dirname(absoluteOutputPath), { recursive: true })
  writeFileSync(absoluteOutputPath, serialized)
  process.stdout.write(`${absoluteOutputPath}\n`)
}
