import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { arch, platform, release } from 'node:os'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { component, type AdapterWorld, type EcsAdapter, type Entity } from './adapter.ts'
import { kootaAdapter } from './adapters/koota.ts'
import { createAnchoredScanAdapter } from './candidates/anchored-scan.ts'
import { createSignaturePersistentAdapter } from './candidates/signature-persistent.ts'
import { createSparsePersistentAdapter } from './candidates/sparse-persistent.ts'

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
  readonly activeHeapDeltaBytes: number
  readonly entityCount: number
  readonly retainedHeapDeltaBytes: number
}

const quick = process.argv.includes('--quick')
const requestedAdapter = process.argv.find((value) => value.startsWith('--adapter='))?.slice(10)
const outputPath = process.argv.find((value) => value.startsWith('--output='))?.slice(9)
const require = createRequire(import.meta.url)

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!
}

function measure(
  run: (sample: number) => number,
  { samples, warmups }: { readonly samples: number; readonly warmups: number }
): TimingResult {
  let checksum = 0
  for (let index = 0; index < warmups; index++) checksum ^= run(-(index + 1))

  const observations: number[] = []
  for (let index = 0; index < samples; index++) {
    const start = performance.now()
    checksum ^= run(index)
    observations.push(performance.now() - start)
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
  globalThis.gc?.()
  const heapBefore = process.memoryUsage().heapUsed

  function captureActiveHeap(): number {
    const memoryWorld = adapter.createWorld()
    spawnBase(memoryWorld, memoryCount)
    memoryWorld.view(BatchedSprites)
    globalThis.gc?.()
    const activeHeap = process.memoryUsage().heapUsed
    memoryWorld.dispose()
    return activeHeap
  }

  const activeHeapDeltaBytes = captureActiveHeap() - heapBefore
  globalThis.gc?.()
  const retainedHeapDeltaBytes = process.memoryUsage().heapUsed - heapBefore
  const memory = { activeHeapDeltaBytes, entityCount: memoryCount, retainedHeapDeltaBytes }

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

  {
    const count = quick ? 2_048 : 16_384
    const world = adapter.createWorld()
    const entities = spawnBase(world, count)
    const entityIndices = entities.map((entity) => world.index(entity))
    const uv = world.store(SpriteUV)
    const color = world.store(SpriteColor)
    record('direct-store-hot', count * 12, (sample) => {
      let checksum = 0
      for (const index of entityIndices) {
        uv.x[index] = sample + index
        uv.y[index] = index * 0.5
        uv.width[index] = 16
        uv.height[index] = 16
        color.r[index] = 1
        color.g[index] = 0.5
        color.b[index] = 0.25
        color.a[index] = 1
        checksum += uv.x[index]! + color.a[index]!
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
    record('stable-query', count * iterations, () => {
      let checksum = 0
      for (let index = 0; index < iterations; index++) checksum += world.view(BatchedSprites).length
      return checksum
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
      return afterAdd
    })
    world.dispose()
  }

  {
    const count = quick ? 2_048 : 12_000
    const world = adapter.createWorld()
    const entities = spawnBase(world, count)
    world.drain(RoutingChanges)
    record('routing-events', count * 3, (sample) => {
      for (const entity of entities) {
        world.patch(entity, SortLayer, { value: sample })
        world.patch(entity, SpriteMaterialRef, { value: sample + 1 })
        world.patch(entity, CameraLayersMask, { value: sample + 2 })
      }
      return world.drain(RoutingChanges).length
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
        checksum ^= world.target(entity, AssignedTo) ?? 0
        world.unassign(entity, AssignedTo)
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

const environment = {
  architecture: arch(),
  commit: execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim(),
  koota: kootaPackage.version,
  node: process.version,
  operatingSystem: `${platform()} ${release()}`,
  packageManager: rootPackage.packageManager,
}

const adapterFactories: Readonly<Record<string, () => EcsAdapter>> = {
  'anchored-scan': createAnchoredScanAdapter,
  koota: () => kootaAdapter,
  'signature-persistent': createSignaturePersistentAdapter,
  'sparse-persistent': createSparsePersistentAdapter,
}

function isolatedResult(name: string): AdapterResult {
  const args = ['--expose-gc', '--experimental-strip-types', import.meta.filename, `--adapter=${name}`]
  if (quick) args.push('--quick')
  const childReport = JSON.parse(
    execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 })
  ) as { results: AdapterResult[] }
  const result = childReport.results[0]
  if (result === undefined) throw new Error(`Isolated benchmark produced no result for ${name}`)
  return result
}

let results: AdapterResult[]
if (requestedAdapter === undefined) {
  results = Object.keys(adapterFactories).map(isolatedResult)
} else {
  const factory = adapterFactories[requestedAdapter]
  if (factory === undefined) throw new Error(`Unknown adapter: ${requestedAdapter}`)
  results = [benchmarkAdapter(factory())]
}

const serialized = `${JSON.stringify({ environment, mode: quick ? 'quick' : 'full', results }, null, 2)}\n`
if (outputPath === undefined) {
  process.stdout.write(serialized)
} else {
  const absoluteOutputPath = resolve(process.cwd(), outputPath)
  mkdirSync(dirname(absoluteOutputPath), { recursive: true })
  writeFileSync(absoluteOutputPath, serialized)
  process.stdout.write(`${absoluteOutputPath}\n`)
}
