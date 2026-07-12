// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signal } from '@preact/signals-core'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Input } from './index.js'

/**
 * T2.8 — `input/textarea` aren't in the role/onActivate table (spec §7): the kit `Input` extends
 * the base uikit `Input` directly, which already owns its hidden `<input>` as its a11y element and
 * syncs `ariaLabel` onto it (`setupAriaAttributes`, spec §1.2). This locks in that the kit wrapper
 * doesn't lose that wiring on the way through its own `defaultOverrides`.
 */

function mount(properties?: ConstructorParameters<typeof Input>[0]): Input {
  const input = new Input(properties)
  new Object3D().add(input)
  return input
}

let realFetch: typeof globalThis.fetch
beforeAll(async () => {
  await loadYoga() // loads the Yoga WASM via fetch — must run BEFORE fetch is stubbed
  realFetch = globalThis.fetch
  globalThis.fetch = (() => new Promise<never>(() => {})) as typeof globalThis.fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

describe('Input a11y wiring', () => {
  it('forwards ariaLabel through to the hidden <input> exposed as a11yElement', () => {
    const input = mount({ ariaLabel: 'Search' })
    try {
      const el = input.a11yElement
      expect(el).toBeDefined()
      expect(el).toBe(input.element)
      expect(el!.tagName).toBe('INPUT')
      expect(el!.getAttribute('aria-label')).toBe('Search')
    } finally {
      input.dispose()
    }
  })

  it('updates aria-label when the ariaLabel prop signal changes', () => {
    const ariaLabel = signal('Search')
    const input = mount({ ariaLabel })
    try {
      expect(input.a11yElement!.getAttribute('aria-label')).toBe('Search')
      ariaLabel.value = 'Find'
      expect(input.a11yElement!.getAttribute('aria-label')).toBe('Find')
    } finally {
      input.dispose()
    }
  })
})
