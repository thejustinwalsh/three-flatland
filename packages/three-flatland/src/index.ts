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
export { DEVTOOLS_BUNDLED, isDevtoolsActive } from './debug-protocol'

