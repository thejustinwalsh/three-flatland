export { SpriteSheetLoader } from './SpriteSheetLoader'
export type { SpriteSheetLoaderOptions } from './SpriteSheetLoader'

export { TextureLoader, applyHierarchicalPresets } from './TextureLoader'
export type { TextureLoaderOptions } from './TextureLoader'

export {
  TextureConfig,
  applyTextureOptions,
  resolveTextureOptions,
  TEXTURE_PRESETS,
} from './texturePresets'
export type { TexturePreset, TextureOptions } from './texturePresets'

// Tilemap loaders — canonical home (moved from src/tilemap/ for symmetry
// with sprite/texture loaders). The runtime classes `TileMap2D`,
// `TileLayer`, and `Tileset` stay in `src/tilemap/`.
export { LDtkLoader } from './LDtkLoader'
export type { LDtkLoaderOptions } from './LDtkLoader'
export { TiledLoader } from './TiledLoader'
export type { TiledLoaderOptions } from './TiledLoader'

// Normal descriptor helpers — asset metadata → NormalRegion[].
export {
  framesToRegions,
  wholeTextureRegion,
  tileToRegions,
  tilesetToRegions,
} from './normalDescriptor'
export type {
  TileNormalCustomData,
  TilesetCell,
  SpriteFrameRect,
  NormalDirection,
  NormalBump,
  NormalRegion,
  NormalSourceDescriptor,
} from './normalDescriptor'
