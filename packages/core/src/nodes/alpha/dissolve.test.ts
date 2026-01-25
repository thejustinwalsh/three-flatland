import { describe, it } from 'vitest'

/**
 * Note: dissolve, dissolveSimple, and dissolveDirectional use TSL's `If`
 * control flow statement, which requires a WebGPU/WebGL shader context to
 * execute. These functions cannot be unit tested in isolation but work
 * correctly when used in actual shaders with a Three.js renderer.
 *
 * Integration tests should verify these functions work correctly in the
 * examples or via browser-based testing.
 */
describe('dissolve', () => {
  it.skip('requires shader context - test in integration', () => {
    // dissolve uses If() which requires a shader builder context
  })
})

describe('dissolveSimple', () => {
  it.skip('requires shader context - test in integration', () => {
    // dissolveSimple uses If() which requires a shader builder context
  })
})

describe('dissolveDirectional', () => {
  it.skip('requires shader context - test in integration', () => {
    // dissolveDirectional uses If() which requires a shader builder context
  })
})
