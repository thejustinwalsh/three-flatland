import type { TileLayer } from '../tilemap/TileLayer'

export interface TileLayerOwnerRelease {
  didError: boolean
  error?: unknown
  retainMaterial: boolean
}

interface TileLayerOwner {
  release(): TileLayerOwnerRelease
  tileDataChanged(): void
}

const owners = new WeakMap<TileLayer, TileLayerOwner>()

export function registerTileLayerOwner(layer: TileLayer, owner: TileLayerOwner): void {
  owners.set(layer, owner)
}

export function releaseTileLayerOwner(layer: TileLayer): TileLayerOwnerRelease {
  const owner = owners.get(layer)
  owners.delete(layer)
  return owner?.release() ?? { didError: false, retainMaterial: false }
}

export function notifyTileLayerDataChanged(layer: TileLayer): void {
  owners.get(layer)?.tileDataChanged()
}

export function clearTileLayerOwner(layer: TileLayer): void {
  owners.delete(layer)
}
