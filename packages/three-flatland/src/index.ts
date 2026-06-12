// three-flatland
// 2D sprites and effects for Three.js using WebGPU and TSL

export const VERSION = '0.1.0-alpha.7'

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

// Color
export * from './color'

// Events / hit-testing
export * from './events'

// Lights
export * from './lights'

// Flatland
export * from './Flatland'

// Devtools debug sink (no-op in prod builds)
export {
  registerDebugArray,
  touchDebugArray,
  unregisterDebugArray,
  registerDebugTexture,
  touchDebugTexture,
  unregisterDebugTexture,
} from './debug/debug-sink'

// Devtools provider helper for non-Flatland three.js apps
export {
  createDevtoolsProvider,
  type DevtoolsProviderHandle,
} from './debug/createDevtoolsProvider'

// Devtools gates — re-exported so wrappers (e.g., @three-flatland/devtools'
// React `<DevtoolsProvider>`) can early-return in production / when
// devtools is disabled at runtime, allowing bundlers to drop the dev-only
// branch entirely.
export { isDevtoolsActive } from './debug-protocol'

// Observable mutation strategies for three.js value types
export * from './observable'

