import { describe, expect, it } from 'vitest'
import { a11yGlobal } from '../a11y/global-state.js'

/**
 * The duplicate-module guard: module-scoped a11y registries are stashed on `globalThis` under a stable
 * `Symbol.for` key, so two copies of the module (version skew / split bundle) resolve to ONE instance
 * instead of forking their state. Here, a repeated call stands in for the "second copy".
 */
describe('a11yGlobal — duplicate-module guard', () => {
  it('returns the SAME instance on repeated calls; the second create() never runs', () => {
    let created = 0
    const first = a11yGlobal('unit-test-registry', () => {
      created += 1
      return new Set<number>()
    })
    const second = a11yGlobal('unit-test-registry', () => {
      created += 1
      return new Set<number>()
    })
    expect(second).toBe(first) // same object — no fork
    expect(created).toBe(1) // the "second copy" reused the shared instance, did not re-create

    // Mutating through one handle is visible through the other — it is genuinely shared state.
    first.add(7)
    expect(second.has(7)).toBe(true)
  })

  it('stores the instance on globalThis under the namespaced Symbol.for key', () => {
    const value = a11yGlobal('unit-test-symbol', () => ({ ok: true }))
    const sym = Symbol.for('@three-flatland/uikit:a11y:unit-test-symbol')
    expect((globalThis as unknown as Record<symbol, unknown>)[sym]).toBe(value)
  })
})
