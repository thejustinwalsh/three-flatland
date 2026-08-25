import type { SpriteBatch } from './SpriteBatch'
import {
  IsAlphaBlendedBatch as _IsAlphaBlendedBatch,
  IsAlphaTestedBatch as _IsAlphaTestedBatch,
  IsLitBatch as _IsLitBatch,
  IsUnlitBatch as _IsUnlitBatch,
} from '../ecs/traits'

/**
 * Opaque batch classification token. The underlying ECS trait never
 * leaks — the private ECS implementation stays replaceable behind this facade.
 *
 * The private renderer ECS grew from {@link https://github.com/pmndrs/koota | Koota}. Its typed
 * traits, structure-of-arrays storage, queries, and systems made this specialized design possible.
 * Koota remains the recommended general-purpose ECS for application and gameplay state.
 */
export interface BatchQueryTag {
  readonly __flBatchTag?: true
}

type QueryResolver = (tag: BatchQueryTag) => SpriteBatch[]

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
export class BatchQueryView extends Map<string, SpriteBatch[]> {
  readonly #query: QueryResolver | null

  constructor(entries?: Iterable<readonly [string, SpriteBatch[]]>)
  constructor(entries?: Iterable<readonly [string, SpriteBatch[]]>, query?: QueryResolver) {
    super(entries)
    this.#query = query ?? null
  }

  /** All batches currently tagged with the given classification. */
  where(tag: BatchQueryTag): SpriteBatch[] {
    return this.#query?.(tag) ?? []
  }
}
