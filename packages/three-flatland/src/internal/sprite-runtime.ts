import type { Entity, World } from '../ecs/runtime'

const worlds = new WeakMap<object, World>()
const entities = new WeakMap<object, Entity>()
const cloneBootstrapMaterials = new WeakSet<object>()
const pendingCloneBootstrapErrors = new WeakMap<object, unknown>()
const committedCloneBootstrapErrors = new WeakMap<object, unknown>()
const observedCloneBootstrapCommits = new WeakMap<object, number>()
let standardSpriteUpdateMatrix: unknown

/** Capture Sprite2D's built-in matrix writer without importing it into ECS systems. @internal */
export function registerStandardSpriteUpdateMatrix(method: unknown): void {
  standardSpriteUpdateMatrix ??= method
}

/** Test whether a sprite still uses the callback-free built-in matrix writer. @internal */
export function isStandardSpriteUpdateMatrix(method: unknown): boolean {
  return method === standardSpriteUpdateMatrix
}

/** Mark a package-owned clone staging material for retirement on replacement/dispose. @internal */
export function markSpriteCloneBootstrapMaterial(sprite: object): void {
  cloneBootstrapMaterials.add(sprite)
}

/** Test whether the sprite still owns its clone staging material. @internal */
export function hasSpriteCloneBootstrapMaterial(sprite: object): boolean {
  return cloneBootstrapMaterials.has(sprite)
}

/** Clear clone staging ownership, returning whether it was active. @internal */
export function consumeSpriteCloneBootstrapMaterial(sprite: object): boolean {
  return cloneBootstrapMaterials.delete(sprite)
}

/** Defer a staging-retirement error until destination enrollment commits. @internal */
export function deferSpriteCloneBootstrapError(sprite: object, error: unknown): void {
  pendingCloneBootstrapErrors.set(sprite, error)
}

/** Observe one Flatland adoption so its outer ownership layer can recognize the commit error. @internal */
export function observeSpriteCloneBootstrapCommit(sprite: object): void {
  observedCloneBootstrapCommits.set(sprite, (observedCloneBootstrapCommits.get(sprite) ?? 0) + 1)
}

/** Stop observing an adoption that returned or failed before the deferred commit error. @internal */
export function clearSpriteCloneBootstrapCommitObservation(sprite: object): void {
  const depth = observedCloneBootstrapCommits.get(sprite)
  if (depth === undefined || depth <= 1) observedCloneBootstrapCommits.delete(sprite)
  else observedCloneBootstrapCommits.set(sprite, depth - 1)
}

/** Rethrow the exact deferred value after SpriteGroup enrollment commits. @internal */
export function throwSpriteCloneBootstrapError(sprite: object, committed = true): void {
  if (!pendingCloneBootstrapErrors.has(sprite)) return
  const error = pendingCloneBootstrapErrors.get(sprite)
  pendingCloneBootstrapErrors.delete(sprite)
  if (committed && observedCloneBootstrapCommits.has(sprite)) committedCloneBootstrapErrors.set(sprite, error)
  throw error
}

/** Identify and consume a cleanup error thrown after SpriteGroup commit. @internal */
export function consumeCommittedSpriteCloneBootstrapError(sprite: object, error: unknown): boolean {
  if (!committedCloneBootstrapErrors.has(sprite) || !Object.is(committedCloneBootstrapErrors.get(sprite), error)) {
    return false
  }
  committedCloneBootstrapErrors.delete(sprite)
  clearSpriteCloneBootstrapCommitObservation(sprite)
  return true
}

export function stageSpriteWorld(sprite: object, world: World): void {
  const current = worlds.get(sprite)
  if (current && current !== world) {
    throw new Error('three-flatland: Cannot switch worlds after creation. Destroy and recreate the object.')
  }
  worlds.set(sprite, world)
}

export function publishSpriteRuntime(sprite: object, world: World | null, entity: Entity | null): void {
  if (world) worlds.set(sprite, world)
  else worlds.delete(sprite)
  if (entity) entities.set(sprite, entity)
  else entities.delete(sprite)
}

export function spriteWorld(sprite: object): World | null {
  return worlds.get(sprite) ?? null
}

export function spriteEntity(sprite: object): Entity | null {
  return entities.get(sprite) ?? null
}

/** Read the private terminal lifecycle generation without widening Sprite2D's public declaration. */
export function spriteLifecycleRevision(sprite: object): number {
  return Reflect.get(sprite, '_lifecycleRevision') as number
}

/** Restore pre-adoption material state through Sprite2D's private transaction seam. */
export function rollbackSpriteManagedMaterialResolution(
  sprite: object,
  material: object,
  bootstrapDefault: boolean,
  registryDefault: boolean,
  bootstrapVariant: boolean,
  registryVariant: boolean
): void {
  const rollback = Reflect.get(sprite, '_rollbackManagedMaterialResolution') as (
    material: object,
    bootstrapDefault: boolean,
    registryDefault: boolean,
    bootstrapVariant: boolean,
    registryVariant: boolean
  ) => void
  rollback.call(sprite, material, bootstrapDefault, registryDefault, bootstrapVariant, registryVariant)
}
