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
export { getGlobalWorld, resetGlobalWorld, assignWorld, type WorldProvider } from './world'

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

// Systems — factory exports return instances with their own scratch
// state. Each SpriteGroup constructs one of each in its constructor.
export {
  createBatchAssignSystem,
  createBatchReassignSystem,
  createBatchRemoveSystem,
  createBatchSortSystem,
  createSceneGraphSyncSystem,
  transformSyncSystem,
  postPassSystem,
} from './systems'
