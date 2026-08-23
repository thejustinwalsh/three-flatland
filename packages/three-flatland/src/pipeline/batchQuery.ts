import { select, type Selector, type World } from '../ecs/runtime'
import type { EntityHandle, WorldHandle } from '../internal/ecs-handles'
import type { SpriteBatch } from './SpriteBatch'
import {
  BatchMesh,
  IsAlphaBlendedBatch as _IsAlphaBlendedBatch,
  IsAlphaTestedBatch as _IsAlphaTestedBatch,
  IsLitBatch as _IsLitBatch,
  IsUnlitBatch as _IsUnlitBatch,
} from '../ecs/traits'

/**
 * Opaque batch classification token. The underlying ECS trait never
 * leaks — the private ECS implementation stays replaceable behind this facade.
 */
export interface BatchQueryTag {
  readonly __flBatchTag?: true
}

/** Batch classification: material alpha-blends (`transparent`, no alphaTest). */
export const IsAlphaBlendedBatch: BatchQueryTag = _IsAlphaBlendedBatch as unknown as BatchQueryTag

/** Batch classification: material alpha-tests (`alphaTest > 0`, opaque fast path). */
export const IsAlphaTestedBatch: BatchQueryTag = _IsAlphaTestedBatch as unknown as BatchQueryTag

/** Batch classification: material carries a lighting colorTransform. */
export const IsLitBatch: BatchQueryTag = _IsLitBatch as unknown as BatchQueryTag

/** Batch classification: material is unlit. */
export const IsUnlitBatch: BatchQueryTag = _IsUnlitBatch as unknown as BatchQueryTag

const AlphaBlendedBatches = select(_IsAlphaBlendedBatch, BatchMesh)
const AlphaTestedBatches = select(_IsAlphaTestedBatch, BatchMesh)
const LitBatches = select(_IsLitBatch, BatchMesh)
const UnlitBatches = select(_IsUnlitBatch, BatchMesh)

function selectorFor(tag: BatchQueryTag): Selector {
  if (tag === IsAlphaBlendedBatch) return AlphaBlendedBatches
  if (tag === IsAlphaTestedBatch) return AlphaTestedBatches
  if (tag === IsLitBatch) return LitBatches
  if (tag === IsUnlitBatch) return UnlitBatches
  throw new TypeError('three-flatland: unsupported batch classification token')
}

/**
 * Read-only view over a world's batches: a `Map<RunKey, SpriteBatch[]>`
 * with a classification query —
 *
 * ```ts
 * const lit = group.batches.where(IsLitBatch)
 * ```
 *
 * Trait existence is the architectural fact; system implementations may
 * evolve from branch → query-narrowing as workload demands without
 * breaking this surface.
 */
export class BatchQueryView extends Map<string, SpriteBatch[]> {
  private _world: WorldHandle | null

  constructor(world: WorldHandle | null, entries?: Iterable<readonly [string, SpriteBatch[]]>) {
    super(entries)
    this._world = world
  }

  /** All batches currently tagged with the given classification. */
  where(tag: BatchQueryTag): SpriteBatch[] {
    if (!this._world) return []
    const world = this._world as World
    const result: SpriteBatch[] = []
    for (const entity of world.view(selectorFor(tag))) {
      const mesh = world.read(entity, BatchMesh)?.mesh
      if (mesh) result.push(mesh)
    }
    return result
  }
}

interface BatchQueryRegistry {
  readonly runs: ReadonlyMap<string, { readonly batches: readonly EntityHandle[] }>
}

/**
 * Build a {@link BatchQueryView} from a world's registry data, keyed by
 * run key. Shared by `SpriteGroup.batches` and `Registry.batches` so the
 * run → mesh-list traversal has exactly one implementation.
 */
export function buildBatchQueryView(
  world: WorldHandle | null,
  registryData: BatchQueryRegistry | null
): BatchQueryView {
  const runtimeWorld = world as World | null
  const view = new BatchQueryView(world)
  if (!registryData) return view
  for (const [key, run] of registryData.runs) {
    const meshes: SpriteBatch[] = []
    for (const batchEntity of run.batches) {
      const mesh = runtimeWorld?.read(batchEntity, BatchMesh)?.mesh
      if (mesh) meshes.push(mesh)
    }
    view.set(key, meshes)
  }
  return view
}
