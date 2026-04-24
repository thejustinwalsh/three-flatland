export { Sprite2DMaterial } from './Sprite2DMaterial'
export type { Sprite2DMaterialOptions } from './Sprite2DMaterial'

// Re-exported from EffectMaterial (originally in Sprite2DMaterial)
export type { ColorTransformFn, ColorTransformContext } from './EffectMaterial'

// Effect system
export { EffectMaterial, computeTier, getPackedComponent } from './EffectMaterial'
export type { EffectMaterialOptions } from './EffectMaterial'
export { MaterialEffect, createMaterialEffect } from './MaterialEffect'
export type {
  MaterialEffectClass,
  EffectSchemaValue,
  EffectSchema,
  EffectValues,
  EffectField,
  EffectNodeContext,
  ChannelNodeContext,
} from './MaterialEffect'

// Channel types and defaults
export { channelDefaults } from './channels'
export type { ChannelName, ChannelNodeMap, WithRequiredChannels } from './channels'

// Per-instance TSL attribute accessors (reads into the interleaved
// core buffer shared between SpriteBatch, Sprite2D standalone, and
// TileLayer geometry). See `instanceAttributes.ts` for layout.
export {
  readFlip,
  readSystemFlags,
  readEnableBits,
  readShadowRadius,
  readLitFlag,
  readReceiveShadowsFlag,
  readCastShadowFlag,
} from './instanceAttributes'
