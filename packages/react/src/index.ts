// @three-flatland/react
// React Three Fiber integration for three-flatland

// Side-effect import for ThreeElements module augmentation
import './types'

export type { FlatlandProps, Sprite2DProps } from './types'

// Resource utilities
export { createResource, createCachedResource, spriteSheet, texture } from './resource'

// Re-export everything from core so R3F users only need one import
// This also ensures the ThreeElements augmentation is picked up
export * from '@three-flatland/core'
