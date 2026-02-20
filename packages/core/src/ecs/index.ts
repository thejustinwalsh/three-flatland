// ECS internals — not exported to users

// Traits
export {
  SpriteUV,
  SpriteColor,
  SpriteFlip,
  SpriteLayer,
  SpriteMaterialRef,
  IsRenderable,
  IsBatched,
  IsStandalone,
  ThreeRef,
  InBatch,
} from './traits'

// World management
export {
  getGlobalWorld,
  resetGlobalWorld,
  assignWorld,
  type WorldProvider,
} from './world'

// Snapshot utilities
export { readTrait, writeTrait } from './snapshot'

// Systems
export {
  batchPrepareSystem,
  bufferSyncColorSystem,
  bufferSyncUVSystem,
  bufferSyncFlipSystem,
  transformSyncSystem,
} from './systems'
