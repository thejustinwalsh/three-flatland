// @three-flatland/presets/react
// React Three Fiber integration for @three-flatland/presets

// Side-effect import for ThreeElements module augmentation
import './react/types'

// React-specific utilities
export * from './react/index'

// Re-export everything from core so R3F users only need one import
export * from './index'
