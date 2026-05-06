// Runtime tilemap classes live here; the `LDtkLoader` and `TiledLoader`
// loaders moved to `src/loaders/`. The legacy re-exports remain for one
// release so existing imports (`three-flatland/tilemap`) keep working
// during migration.

export { TileMap2D } from './TileMap2D'
export { Tileset } from './Tileset'
export { TileLayer } from './TileLayer'
export type {
  TileMapData,
  TileMap2DOptions,
  TilesetData,
  TileLayerData,
  TileLayerOptions,
  ObjectLayerData,
  TileMapObject,
  TileDefinition,
  TileAnimationFrame,
  CollisionShape,
  ChunkCoord,
  TileInstance,
} from './types'

// Back-compat: loaders moved to `src/loaders/`. Deprecated re-exports.
// Migrate imports to `three-flatland/loaders` when updating consumer code.
export { LDtkLoader } from '../loaders/LDtkLoader'
export type { LDtkLoaderOptions } from '../loaders/LDtkLoader'
export { TiledLoader } from '../loaders/TiledLoader'
export type { TiledLoaderOptions } from '../loaders/TiledLoader'
