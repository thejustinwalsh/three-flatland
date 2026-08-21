// Pipeline exports

// Side-effect: restores pre-upload timing for r185's instanced-buffer update
// event (works around the one-frame lag when an InstancedMesh's `count` grows).
// Imported here so anyone using the pipeline picks up the patch.
import './_instanceEventUpdateBeforePatch'

export { PassEffect, createPassEffect } from './PassEffect'
export type { PassEffectClass, PassEffectContext, PassEffectFn } from './PassEffect'
export { SpriteGroup } from './SpriteGroup'
export { SpriteBatch } from './SpriteBatch'
export { SortLayerManager, SortLayer } from './SortLayerManager'
export { SortLayerGroup } from './SortLayerGroup'
export { BatchQueryView, IsAlphaBlendedBatch, IsAlphaTestedBatch, IsLitBatch, IsUnlitBatch } from './batchQuery'
export type { BatchQueryTag } from './batchQuery'
export {
  SortLayers,
  declareSortLayer,
  getSortLayer,
  resolveSortLayer,
  encodeSortKey,
  decodeSortKey,
} from './sortLayers'
export type { SortLayerConfig, BuiltInSortLayer, SortLayerRegistry, SortLayerName, SortLayerValue } from './sortLayers'
export type {
  BlendMode,
  SortMode,
  InstanceAttributeType,
  InstanceAttributeConfig,
  SortLayerDescriptor,
  RenderStats,
  ClipRect,
  SpriteGroupOptions,
  SpriteSortFunction,
  BatchKey,
} from './types'
