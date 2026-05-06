// @three-flatland/slug/react
// React Three Fiber integration for Slug text rendering

// Side-effect import for ThreeElements module augmentation
import './react/types'

// React-specific utilities
export * from './react/index'

// Re-export everything from core so R3F users only need one import
export * from './index'
