// Light2D
export { Light2D, isLight2D } from './Light2D'
export type { Light2DOptions, Light2DType, Light2DUniforms } from './Light2D'

// LightStore (DataTexture management — used by LightEffect subclasses)
export { LightStore } from './LightStore'
export type { TileLookupFn } from './LightStore'

// LightEffect base class + factory
export { LightEffect, createLightEffect } from './LightEffect'
export type {
  LightEffectBuildContext,
  LightEffectRuntimeContext,
  LightEffectClass,
  EffectSchema,
  EffectSchemaValue,
  EffectField,
  EffectValues,
  EffectConstants,
  UniformKeys,
  ChannelName,
  WithRequiredChannels,
} from './LightEffect'

// GPU infrastructure (used by preset LightEffects that own these resources)
export { OcclusionPass } from './OcclusionPass'
export type { OcclusionPassOptions } from './OcclusionPass'
export { SDFGenerator } from './SDFGenerator'
export { RadianceCascades } from './RadianceCascades'
export type { RadianceCascadesConfig } from './RadianceCascades'
export { ForwardPlusLighting, TILE_SIZE, MAX_LIGHTS_PER_TILE } from './ForwardPlusLighting'

// Shared coordinate utilities
export { worldToUV, uvToWorld } from './coordUtils'

// TSL accessors for per-instance packed data + helper to gate
// lighting on the lit flag. See `wrapWithLightFlags.ts` header for
// the layout these helpers index into.
export {
  // Raw reads
  readFlip,
  readSystemFlags,
  readEnableBits,
  readShadowRadius,
  // Typed bit readers
  readLitFlag,
  readReceiveShadowsFlag,
  readCastShadowFlag,
  // Composite helper
  wrapWithLightFlags,
} from './wrapWithLightFlags'
