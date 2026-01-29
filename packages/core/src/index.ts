// @three-flatland/core
// Core library for 2D sprites and effects in Three.js

export const VERSION = '0.4.0'

// Main API
export { Flatland, convertLight3DTo2D } from './Flatland'
export type { FlatlandOptions } from './Flatland'

// 2D Lights
export * from './lights'

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

// TSL Nodes
export * from './nodes'

// Tilemaps
export * from './tilemap'
