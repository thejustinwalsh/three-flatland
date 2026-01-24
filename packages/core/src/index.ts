// @three-flatland/core
// Core library for 2D sprites and effects in Three.js

export const VERSION = '0.1.0'

// Sprites
export * from './sprites'

// Materials
export * from './materials'

// Loaders
export * from './loaders'

// Constants
export const Layers = {
  BACKGROUND: 0,
  GROUND: 1,
  SHADOWS: 2,
  ENTITIES: 3,
  EFFECTS: 4,
  FOREGROUND: 5,
  UI: 6,
} as const

export type Layer = (typeof Layers)[keyof typeof Layers]
