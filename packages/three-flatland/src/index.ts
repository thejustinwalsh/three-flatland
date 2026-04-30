// three-flatland
// 2D sprites and effects for Three.js using WebGPU and TSL

export const VERSION = '0.4.0'

// Sprites
export * from './sprites'

// Animation
export * from './animation'

// Materials
export * from './materials'

// Loaders
export * from './loaders'

// Pipeline
export * from './pipeline'

// Tilemaps
export * from './tilemap'

// Global Uniforms
export * from './GlobalUniforms'

// Flatland
export * from './Flatland'

// Reactive utilities for class authors building custom Object3D
// subclasses that participate in R3F's no-args + post-construction
// property setter lifecycle. See `DeferredProps` (mixin) +
// `deferredProps` (factory) for the deferred multi-prop dependency
// system used by AnimatedSprite2D.
export * from './mixins/DeferredProps'

