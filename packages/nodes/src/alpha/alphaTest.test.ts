import { describe, it } from 'vitest'

/**
 * Note: alphaTest and alphaTestOpaque use TSL's `If` control flow statement,
 * which requires a WebGPU/WebGL shader context to execute. These functions
 * cannot be unit tested in isolation but work correctly when used in actual
 * shaders with a Three.js renderer.
 *
 * Integration tests should verify these functions work correctly in the
 * examples or via browser-based testing.
 */
describe('alphaTest', () => {
  it.skip('requires shader context - test in integration', () => {
    // alphaTest uses If() which requires a shader builder context
  })
})

describe('alphaTestOpaque', () => {
  it.skip('requires shader context - test in integration', () => {
    // alphaTestOpaque uses If() which requires a shader builder context
  })
})
