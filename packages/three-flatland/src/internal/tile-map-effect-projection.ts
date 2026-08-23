import type { MaterialEffect } from '../materials/MaterialEffect'
import type { TileMap2D } from '../tilemap/TileMap2D'

const projectionSync = new WeakMap<TileMap2D, (effect: MaterialEffect, fieldName: string) => void>()

export function registerTileMapEffectProjection(
  tileMap: TileMap2D,
  sync: (effect: MaterialEffect, fieldName: string) => void
): void {
  projectionSync.set(tileMap, sync)
}

export function syncTileMapEffectProjection(tileMap: TileMap2D, effect: MaterialEffect, fieldName: string): void {
  projectionSync.get(tileMap)?.(effect, fieldName)
}

export function clearTileMapEffectProjection(tileMap: TileMap2D): void {
  projectionSync.delete(tileMap)
}
