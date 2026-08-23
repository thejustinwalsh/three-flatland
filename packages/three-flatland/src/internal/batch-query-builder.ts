import { select, type Selector, type World } from '../ecs/runtime'
import type { RegistryData } from '../ecs/batchUtils'
import {
  BatchQueryView,
  IsAlphaBlendedBatch,
  IsAlphaTestedBatch,
  IsLitBatch,
  IsUnlitBatch,
  type BatchQueryTag,
} from '../pipeline/batchQuery'
import type { SpriteBatch } from '../pipeline/SpriteBatch'
import {
  BatchMesh,
  IsAlphaBlendedBatch as AlphaBlendedTrait,
  IsAlphaTestedBatch as AlphaTestedTrait,
  IsLitBatch as LitTrait,
  IsUnlitBatch as UnlitTrait,
} from '../ecs/traits'

const AlphaBlendedBatches = select(AlphaBlendedTrait, BatchMesh)
const AlphaTestedBatches = select(AlphaTestedTrait, BatchMesh)
const LitBatches = select(LitTrait, BatchMesh)
const UnlitBatches = select(UnlitTrait, BatchMesh)

function selectorFor(tag: BatchQueryTag): Selector {
  if (tag === IsAlphaBlendedBatch) return AlphaBlendedBatches
  if (tag === IsAlphaTestedBatch) return AlphaTestedBatches
  if (tag === IsLitBatch) return LitBatches
  if (tag === IsUnlitBatch) return UnlitBatches
  throw new TypeError('three-flatland: unsupported batch classification token')
}

type RuntimeBatchQueryViewConstructor = new (
  entries: undefined,
  query: (tag: BatchQueryTag) => SpriteBatch[]
) => BatchQueryView

export function buildBatchQueryView(world: World | null, registry: RegistryData | null): BatchQueryView {
  if (!world || !registry) return new BatchQueryView()
  const view = new (BatchQueryView as RuntimeBatchQueryViewConstructor)(undefined, (tag) => {
    const batches: SpriteBatch[] = []
    for (const entity of world.view(selectorFor(tag))) {
      const mesh = world.read(entity, BatchMesh)?.mesh
      if (mesh) batches.push(mesh)
    }
    return batches
  })
  for (const [runKey, run] of registry.runs) {
    const batches: SpriteBatch[] = []
    for (const entity of run.batches) {
      const mesh = world.read(entity, BatchMesh)?.mesh
      if (mesh) batches.push(mesh)
    }
    view.set(runKey, batches)
  }
  return view
}
