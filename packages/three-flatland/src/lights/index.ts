// Light2D exports
export { Light2D, isLight2D } from './Light2D'
export type { Light2DOptions, Light2DType, Light2DUniforms } from './Light2D'

// LightEffect base class + factory
export {
  LightEffect,
  createLightEffect,
} from './LightEffect'
export type {
  LightEffectContext,
  LightEffectClass,
  EffectSchema,
  EffectSchemaValue,
  EffectField,
  EffectValues,
} from './LightEffect'

// Lighting system (internal infrastructure — used by LightEffect subclasses)
export { LightingSystem } from './LightingSystem'
export type { TileLookupFn } from './LightingSystem'

// SDF Generator (pure SDF, no light propagation)
export { SDFGenerator } from './SDFGenerator'

// Radiance Cascades GI system
export { RadianceCascades } from './RadianceCascades'
export type { RadianceCascadesConfig } from './RadianceCascades'

// Forward+ CPU-based tile culler
export {
  ForwardPlusLighting,
  TILE_SIZE,
  MAX_LIGHTS_PER_TILE,
} from './ForwardPlusLighting'

// Shared coordinate utilities
export { worldToUV, uvToWorld } from './coordUtils'

// Lighting strategies (internal — wrapped by LightEffect subclasses)
export {
  SimpleLightingStrategy,
  DirectLightingStrategy,
  RadianceLightingStrategy,
} from './LightingStrategy'
export type { LightingStrategy, LightingStrategyContext } from './LightingStrategy'
