import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { TileMap2D } from '../tilemap/TileMap2D'

interface SpriteMaterialTransition {
  rollback(): void
  finalize?(): void
}

type SpriteMaterialListener = (previous: Sprite2DMaterial, current: Sprite2DMaterial) => void | SpriteMaterialTransition
type TileMapMaterialListener = (
  previous: readonly Sprite2DMaterial[],
  current: readonly Sprite2DMaterial[]
) => void | ReadonlySet<Sprite2DMaterial>
type TileMapMaterialRetentionPolicy = (materials: readonly Sprite2DMaterial[]) => ReadonlySet<Sprite2DMaterial>

const spriteMaterialListeners = new WeakMap<Sprite2D, Set<SpriteMaterialListener>>()
const spriteDisposeListeners = new WeakMap<Sprite2D, Set<() => void>>()
const tileMapMaterialListeners = new WeakMap<TileMap2D, Set<TileMapMaterialListener>>()
const tileMapDisposeListeners = new WeakMap<TileMap2D, Set<() => void>>()
const tileMapMaterialRetentionPolicies = new WeakMap<TileMap2D, Set<TileMapMaterialRetentionPolicy>>()

function subscribe<T>(registry: WeakMap<object, Set<T>>, owner: object, listener: T): () => void {
  let listeners = registry.get(owner)
  if (!listeners) {
    listeners = new Set()
    registry.set(owner, listeners)
  }
  listeners.add(listener)
  return () => listeners?.delete(listener)
}

export function subscribeSpriteMaterialChanges(sprite: Sprite2D, listener: SpriteMaterialListener): () => void {
  return subscribe(spriteMaterialListeners, sprite, listener)
}

export function notifySpriteMaterialChange(
  sprite: Sprite2D,
  previous: Sprite2DMaterial,
  current: Sprite2DMaterial
): () => void {
  if (previous === current) return () => {}
  const transitions: SpriteMaterialTransition[] = []
  try {
    for (const listener of spriteMaterialListeners.get(sprite) ?? []) {
      const transition = listener(previous, current)
      if (transition) transitions.push(transition)
    }
  } catch (error) {
    for (let index = transitions.length - 1; index >= 0; index--) {
      try {
        transitions[index]!.rollback()
      } catch {
        // Preserve the original ownership failure after best-effort rollback.
      }
    }
    throw error
  }
  return () => {
    let firstError: unknown
    let didError = false
    for (const transition of transitions) {
      try {
        transition.finalize?.()
      } catch (error) {
        if (!didError) {
          firstError = error
          didError = true
        }
      }
    }
    if (didError) throw firstError
  }
}

export function subscribeSpriteDispose(sprite: Sprite2D, listener: () => void): () => void {
  return subscribe(spriteDisposeListeners, sprite, listener)
}

export function notifySpriteDispose(sprite: Sprite2D): void {
  const listeners = spriteDisposeListeners.get(sprite)
  if (!listeners) return
  for (const listener of new Set(listeners)) listener()
  listeners.clear()
}

export function subscribeTileMapMaterials(tileMap: TileMap2D, listener: TileMapMaterialListener): () => void {
  return subscribe(tileMapMaterialListeners, tileMap, listener)
}

export function notifyTileMapMaterials(
  tileMap: TileMap2D,
  previous: readonly Sprite2DMaterial[],
  current: readonly Sprite2DMaterial[]
): ReadonlySet<Sprite2DMaterial> {
  const retained = new Set<Sprite2DMaterial>()
  for (const listener of tileMapMaterialListeners.get(tileMap) ?? []) {
    const requested = listener(previous, current)
    if (requested) for (const material of requested) retained.add(material)
  }
  return retained
}

export function subscribeTileMapMaterialRetention(
  tileMap: TileMap2D,
  policy: TileMapMaterialRetentionPolicy
): () => void {
  return subscribe(tileMapMaterialRetentionPolicies, tileMap, policy)
}

export function queryTileMapMaterialRetention(
  tileMap: TileMap2D,
  materials: readonly Sprite2DMaterial[]
): ReadonlySet<Sprite2DMaterial> {
  const retained = new Set<Sprite2DMaterial>()
  for (const policy of tileMapMaterialRetentionPolicies.get(tileMap) ?? []) {
    for (const material of policy(materials)) retained.add(material)
  }
  return retained
}

export function subscribeTileMapDispose(tileMap: TileMap2D, listener: () => void): () => void {
  return subscribe(tileMapDisposeListeners, tileMap, listener)
}

export function notifyTileMapDispose(tileMap: TileMap2D): void {
  const listeners = tileMapDisposeListeners.get(tileMap)
  if (!listeners) return
  for (const listener of new Set(listeners)) listener()
  listeners.clear()
}

export function clearTileMapObservers(tileMap: TileMap2D): void {
  tileMapMaterialListeners.get(tileMap)?.clear()
  tileMapDisposeListeners.get(tileMap)?.clear()
  tileMapMaterialRetentionPolicies.get(tileMap)?.clear()
}
