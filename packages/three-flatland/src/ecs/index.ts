// ECS internals — not exported to users

// Traits
export {
  SpriteUV,
  SpriteColor,
  SpriteFlip,
  SpriteLayer,
  SpriteZIndex,
  SpriteMaterialRef,
  IsRenderable,
  IsBatched,
  IsStandalone,
  BatchSlot,
  InBatch,
  BatchMesh,
  BatchMeta,
  BatchRegistry,
  type BatchRun,
  PostPassTrait,
  PostPassRegistry,
} from './traits'

// World management
export {
  getGlobalWorld,
  resetGlobalWorld,
  assignWorld,
  type WorldProvider,
} from './world'

// Snapshot utilities
export { resolveStore } from './snapshot'

// Batch utilities
export {
  computeRunKey,
  binarySearch,
  sortedInsert,
  sortedRemove,
  getOrCreateRun,
  findOrCreateBatch,
  recycleBatchIfEmpty,
  rebuildBatchOrder,
  allocateBatchIdx,
  freeBatchIdx,
} from './batchUtils'

// Systems
export {
  batchAssignSystem,
  batchReassignSystem,
  batchRemoveSystem,
  bufferSyncColorSystem,
  bufferSyncUVSystem,
  bufferSyncFlipSystem,
  bufferSyncEffectSystem,
  transformSyncSystem,
  sceneGraphSyncSystem,
  postPassSystem,
} from './systems'
