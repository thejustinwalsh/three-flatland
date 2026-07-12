// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signal } from '@preact/signals-core'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Textarea } from './index.js'

/**
 * T2.8 — `input/textarea` aren't in the role/onActivate table (spec §7). The kit `Textarea` wraps
 * an internal base uikit `Input` (`multiline: true`) which owns its own hidden `<textarea>` as its
 * a11y element (`setupAriaAttributes`, spec §1.2) regardless of the outer Container's `role`. This
 * asserts the outer `Textarea`'s `ariaLabel` prop actually reaches that inner hidden `<textarea>`.
 */

function mount(properties?: ConstructorParameters<typeof Textarea>[0]): Textarea {
  const textarea = new Textarea(properties)
  new Object3D().add(textarea)
  return textarea
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

describe('Textarea a11y wiring', () => {
  it('forwards ariaLabel through to the inner Input hidden <textarea> exposed as a11yElement', () => {
    const textarea = mount({ ariaLabel: 'Comments' })
    try {
      const el = textarea.input.a11yElement
      expect(el).toBeDefined()
      expect(el).toBe(textarea.input.element)
      expect(el!.tagName).toBe('TEXTAREA')
      expect(el!.getAttribute('aria-label')).toBe('Comments')
    } finally {
      textarea.dispose()
    }
  })

  it('updates aria-label on the inner hidden <textarea> when the ariaLabel prop signal changes', () => {
    const ariaLabel = signal('Comments')
    const textarea = mount({ ariaLabel })
    try {
      expect(textarea.input.a11yElement!.getAttribute('aria-label')).toBe('Comments')
      ariaLabel.value = 'Feedback'
      expect(textarea.input.a11yElement!.getAttribute('aria-label')).toBe('Feedback')
    } finally {
      textarea.dispose()
    }
  })
})
