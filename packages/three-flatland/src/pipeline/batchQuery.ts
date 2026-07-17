import type { Trait, World } from 'koota'
import type { SpriteBatch } from './SpriteBatch'
import type { RegistryData, RunKey } from '../ecs/batchUtils'
import {
  BatchMesh,
  IsAlphaBlendedBatch as _IsAlphaBlendedBatch,
  IsAlphaTestedBatch as _IsAlphaTestedBatch,
  IsLitBatch as _IsLitBatch,
  IsUnlitBatch as _IsUnlitBatch,
} from '../ecs/traits'

/**
 * Opaque batch classification token. The underlying ECS trait never
 * leaks — the Koota dependency stays swappable behind this facade.
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
export class BatchQueryView extends Map<RunKey, SpriteBatch[]> {
  private _world: World | null

  constructor(world: World | null, entries?: Iterable<readonly [RunKey, SpriteBatch[]]>) {
    super(entries)
    this._world = world
  }

  /** All batches currently tagged with the given classification. */
  where(tag: BatchQueryTag): SpriteBatch[] {
    if (!this._world) return []
    const result: SpriteBatch[] = []
    for (const entity of this._world.query(tag as unknown as Trait, BatchMesh)) {
      const mesh = entity.get(BatchMesh)?.mesh
      if (mesh) result.push(mesh)
    }
    return result
  }
}

/**
 * Build a {@link BatchQueryView} from a world's registry data, keyed by
 * run key. Shared by `SpriteGroup.batches` and `Registry.batches` so the
 * run → mesh-list traversal has exactly one implementation.
 */
export function buildBatchQueryView(world: World | null, registryData: RegistryData | null): BatchQueryView {
  const view = new BatchQueryView(world)
  if (!registryData) return view
  for (const [key, run] of registryData.runs) {
    const meshes: SpriteBatch[] = []
    for (const batchEntity of run.batches) {
      const mesh = batchEntity.get(BatchMesh)?.mesh
      if (mesh) meshes.push(mesh)
    }
    view.set(key, meshes)
  }
  return view
}
