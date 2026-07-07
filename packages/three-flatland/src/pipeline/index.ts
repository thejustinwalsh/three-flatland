// Pipeline exports

// Side-effect: patches three.js's `InstanceNode` so dirty-range propagation
// fires before the geometry upload (works around the one-frame lag in three.js
// when an InstancedMesh's `count` grows). Imported here so anyone using the
// pipeline picks up the patch.
import './_instanceNodeUpdateBeforePatch'
// Side-effect: silences three's missing-position warning for synth-quad
// geometries (the constant fallback is the design there — positionNode
// fully overrides the value and no binding is spent).
import './_synthQuadPositionWarnPatch'

export { PassEffect, createPassEffect } from './PassEffect'
export type { PassEffectClass, PassEffectContext, PassEffectFn } from './PassEffect'
export { SpriteGroup } from './SpriteGroup'
export { SpriteBatch } from './SpriteBatch'
export { SortLayerManager, SortLayer } from './SortLayerManager'
export { SortLayerGroup } from './SortLayerGroup'
export {
  BatchQueryView,
  IsAlphaBlendedBatch,
  IsAlphaTestedBatch,
  IsLitBatch,
  IsUnlitBatch,
} from './batchQuery'
export type { BatchQueryTag } from './batchQuery'
export {
  SortLayers,
  declareSortLayer,
  getSortLayer,
  resolveSortLayer,
  encodeSortKey,
  decodeSortKey,
} from './sortLayers'
export type {
  SortLayerConfig,
  BuiltInSortLayer,
  SortLayerRegistry,
  SortLayerName,
  SortLayerValue,
} from './sortLayers'
export type {
  BlendMode,
  SortMode,
  InstanceAttributeType,
  InstanceAttributeConfig,
  SortLayerDescriptor,
  RenderStats,
  SpriteGroupOptions,
  SpriteSortFunction,
  BatchKey,
} from './types'
