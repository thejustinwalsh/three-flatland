import type { MaterialEffect } from '../materials/MaterialEffect'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { TileLayer } from '../tilemap/TileLayer'

export interface TileLayerCleanupResult {
  didError: boolean
  error?: unknown
}

export interface TileLayerMaterialReplacement extends TileLayerCleanupResult {
  previous: Sprite2DMaterial
}

interface TileLayerOperations {
  commitEffectValues(): void
  copyMaterialState(source: Sprite2DMaterial): void
  dispose(disposeMaterial: boolean, notifyOwner: boolean): void
  prepareEffectMaterial(effects: readonly MaterialEffect[]): Sprite2DMaterial
  prepareEffectValues(effect: MaterialEffect, fieldName: string): void
  replaceMaterial(current: Sprite2DMaterial, effects: readonly MaterialEffect[]): TileLayerMaterialReplacement
}

const operations = new WeakMap<TileLayer, TileLayerOperations>()

export function registerTileLayerOperations(layer: TileLayer, value: TileLayerOperations): void {
  operations.set(layer, value)
}

function resolve(layer: TileLayer): TileLayerOperations {
  const value = operations.get(layer)
  if (!value) throw new Error('TileLayer internal operations are unavailable')
  return value
}

export function copyTileLayerMaterialState(layer: TileLayer, source: Sprite2DMaterial): void {
  resolve(layer).copyMaterialState(source)
}

export function disposeTileLayer(layer: TileLayer, disposeMaterial: boolean): void {
  resolve(layer).dispose(disposeMaterial, false)
}

export function prepareTileLayerEffectMaterial(layer: TileLayer, effects: readonly MaterialEffect[]): Sprite2DMaterial {
  return resolve(layer).prepareEffectMaterial(effects)
}

export function replaceTileLayerMaterial(
  layer: TileLayer,
  current: Sprite2DMaterial,
  effects: readonly MaterialEffect[]
): TileLayerMaterialReplacement {
  return resolve(layer).replaceMaterial(current, effects)
}

export function prepareTileLayerEffectValues(layer: TileLayer, effect: MaterialEffect, fieldName: string): void {
  resolve(layer).prepareEffectValues(effect, fieldName)
}

export function commitTileLayerEffectValues(layer: TileLayer): void {
  resolve(layer).commitEffectValues()
}
