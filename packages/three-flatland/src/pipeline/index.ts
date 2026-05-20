// Pipeline exports

// Side-effect: patches three.js's `InstanceNode` so dirty-range propagation
// fires before the geometry upload (works around the one-frame lag in three.js
// when an InstancedMesh's `count` grows). Imported here so anyone using the
// pipeline picks up the patch.
import './_instanceNodeUpdateBeforePatch'

export { PassEffect, createPassEffect } from './PassEffect'
export type { PassEffectClass, PassEffectContext, PassEffectFn } from './PassEffect'
export { SpriteGroup } from './SpriteGroup'
export { SpriteBatch, DEFAULT_BATCH_SIZE } from './SpriteBatch'
export { LayerManager, Layer } from './LayerManager'
export { Layers, encodeSortKey, decodeSortKey } from './layers'
export type { LayerName, LayerValue, Layer as LayerType } from './layers'
export type {
  BlendMode,
  SortMode,
  InstanceAttributeType,
  InstanceAttributeConfig,
  LayerConfig,
  RenderStats,
  SpriteGroupOptions,
  SpriteSortFunction,
  BatchKey,
} from './types'
