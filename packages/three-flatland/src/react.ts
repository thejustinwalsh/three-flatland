// three-flatland/react
// React Three Fiber integration for three-flatland

// Side-effect import for ThreeElements module augmentation
import './react/types'

export type { FlatlandProps, Sprite2DProps, EffectElement } from './react/types'

// Attach helpers
export { attachEffect } from './react/attach'

// Resource utilities
export { createResource, createCachedResource, spriteSheet, texture } from './react/resource'

// Re-export everything from core so R3F users only need one import
export * from './index'
