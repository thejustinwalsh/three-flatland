// three-flatland/react — React-specific utilities
// This barrel exports only React-specific APIs (not core re-exports).
// The consumer-facing entry point (src/react.ts) re-exports core + this.

// Types
export type { EffectElement, LightEffectElement } from './types'

// Attach helpers
export { attachEffect, attachLighting } from './attach'
