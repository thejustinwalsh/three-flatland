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

// Utility: wrap lighting with per-instance light flags for batched sprites
export { wrapWithLightFlags, readReceiveShadowsFlag } from './wrapWithLightFlags'
