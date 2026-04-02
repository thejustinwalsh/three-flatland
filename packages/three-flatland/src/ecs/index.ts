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
  LightEffectTrait,
  LightingContext,
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

// SystemSchedule
export { SystemSchedule, type SystemFn } from './SystemSchedule'

// Systems
export {
  batchAssignSystem,
  batchReassignSystem,
  batchRemoveSystem,
  deferredDestroySystem,
  bufferSyncColorSystem,
  bufferSyncUVSystem,
  bufferSyncFlipSystem,
  bufferSyncEffectSystem,
  transformSyncSystem,
  sceneGraphSyncSystem,
  postPassSystem,
  lightSyncSystem,
  lightEffectSystem,
  lightMaterialAssignSystem,
  materialVersionSystem,
  effectTraitsSystem,
  conditionalTransformSyncSystem,
  lateAssignSystem,
  flushDirtyRangesSystem,
} from './systems'
