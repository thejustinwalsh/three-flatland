import { SparseSet } from './sparse-set'
import { fail } from './error'
import type { EntityHandle } from '../../internal/ecs-handles'

export type { EntityHandle } from '../../internal/ecs-handles'
export type Entity = EntityHandle

export const ENTITY_INDEX_BITS = 20
export const ENTITY_INDEX_STRIDE = 2 ** ENTITY_INDEX_BITS
export const ENTITY_INDEX_MASK = ENTITY_INDEX_STRIDE - 1
export const MAX_ENTITY_GENERATION = Math.floor(Number.MAX_SAFE_INTEGER / ENTITY_INDEX_STRIDE)

export function entityIndex(entity: Entity): number {
  return entity & ENTITY_INDEX_MASK
}

export function entityGeneration(entity: Entity): number {
  return Math.floor(entity / ENTITY_INDEX_STRIDE)
}

export function packEntity(index: number, generation: number): Entity {
  if (!Number.isSafeInteger(index) || index < 0 || index > ENTITY_INDEX_MASK) {
    fail('Index range', RangeError)
  }
  if (!Number.isSafeInteger(generation) || generation < 1 || generation > MAX_ENTITY_GENERATION) {
    fail('generation outside safe handle range', RangeError)
  }
  const entity = generation * ENTITY_INDEX_STRIDE + index
  if (!Number.isSafeInteger(entity)) {
    fail('generation exhausted', RangeError)
  }
  return entity as Entity
}

export interface EntityPoolLimits {
  readonly maxGeneration?: number
  readonly maxIndex?: number
}

/** World-local allocator. Exported only from this private source module for boundary tests. */
export class EntityPool {
  readonly alive = new SparseSet()
  private readonly freeIndices: number[] = []
  readonly generations: number[] = []
  private readonly maxGeneration: number
  private readonly maxIndex: number
  private nextIndex = 0

  constructor({ maxGeneration = MAX_ENTITY_GENERATION, maxIndex = ENTITY_INDEX_MASK }: EntityPoolLimits = {}) {
    if (!Number.isSafeInteger(maxIndex) || maxIndex < 0 || maxIndex > ENTITY_INDEX_MASK) {
      fail('Invalid maxIndex', RangeError)
    }
    if (!Number.isSafeInteger(maxGeneration) || maxGeneration < 1 || maxGeneration > MAX_ENTITY_GENERATION) {
      fail('Invalid maxGeneration', RangeError)
    }
    this.maxGeneration = maxGeneration
    this.maxIndex = maxIndex
  }

  assertCanAllocate(): void {
    if (this.freeIndices.length === 0 && this.nextIndex > this.maxIndex) {
      fail('Exhausted index capacity', RangeError)
    }
  }

  allocate(): Entity {
    this.assertCanAllocate()
    const index = this.freeIndices.length > 0 ? this.freeIndices.pop()! : this.nextIndex++
    const generation = this.generations[index] ?? 1
    this.generations[index] = generation
    this.alive.add(index)
    return packEntity(index, generation)
  }

  isAlive(entity: Entity): boolean {
    if (!Number.isSafeInteger(entity) || entity < ENTITY_INDEX_STRIDE) return false
    const index = entityIndex(entity)
    return this.alive.has(index) && this.generations[index] === entityGeneration(entity)
  }

  handle(index: number): Entity {
    if (!this.alive.has(index)) fail(`Dead index ${index}`)
    return packEntity(index, this.generations[index] ?? 1)
  }

  destroy(entity: Entity): void {
    if (!this.isAlive(entity)) fail(`Stale entity handle ${entity}`)
    const index = entityIndex(entity)
    this.alive.delete(index)
    const nextGeneration = (this.generations[index] ?? 1) + 1
    this.generations[index] = Math.min(nextGeneration, this.maxGeneration)
    if (nextGeneration < this.maxGeneration) this.freeIndices.push(index)
  }

  dispose(): void {
    this.alive.release()
    this.freeIndices.length = 0
    this.generations.length = 0
  }
}
