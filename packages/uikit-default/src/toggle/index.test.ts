// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Toggle } from './index.js'

/**
 * Phase 2 native a11y wiring (spec §7): role: 'togglebutton', ariaPressed reflecting
 * currentSignal, and behavior moved from onClick to onActivate so pointer, keyboard,
 * and AT all drive the same toggle logic through Component.activate().
 */

function mount(toggle: Toggle): Toggle {
  new Object3D().add(toggle)
  return toggle
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

afterEach(() => {
  for (const el of document.querySelectorAll('[data-uikit-a11y]')) {
    el.remove()
  }
})

describe('Toggle a11y wiring', () => {
  it('exposes a togglebutton with aria-pressed reflecting the unchecked default', () => {
    const toggle = mount(new Toggle())
    try {
      const el = toggle.a11yElement as HTMLButtonElement
      expect(el.tagName).toBe('BUTTON')
      expect(el.getAttribute('aria-pressed')).toBe('false')
    } finally {
      toggle.dispose()
    }
  })

  it('reflects defaultChecked through aria-pressed', () => {
    const toggle = mount(new Toggle({ defaultChecked: true }))
    try {
      const el = toggle.a11yElement as HTMLButtonElement
      expect(el.getAttribute('aria-pressed')).toBe('true')
    } finally {
      toggle.dispose()
    }
  })

  it('clicking the hidden a11y element (AT/keyboard path) flips the uncontrolled state', () => {
    const toggle = mount(new Toggle())
    try {
      expect(toggle.currentSignal.peek()).toBeUndefined()
      toggle.a11yElement!.click()
      expect(toggle.currentSignal.peek()).toBe(true)
      expect(toggle.a11yElement!.getAttribute('aria-pressed')).toBe('true')

      toggle.a11yElement!.click()
      expect(toggle.currentSignal.peek()).toBe(false)
      expect(toggle.a11yElement!.getAttribute('aria-pressed')).toBe('false')
    } finally {
      toggle.dispose()
    }
  })

  it('writing the checked prop updates aria-pressed without going through activation', () => {
    let onCheckedChangeCalls = 0
    const toggle = mount(
      new Toggle({ checked: false, onCheckedChange: () => (onCheckedChangeCalls += 1) })
    )
    try {
      expect(toggle.a11yElement!.getAttribute('aria-pressed')).toBe('false')
      toggle.setProperties({ checked: true })
      expect(toggle.a11yElement!.getAttribute('aria-pressed')).toBe('true')
      expect(onCheckedChangeCalls).toBe(0)
    } finally {
      toggle.dispose()
    }
  })

  it('does not flip a controlled toggle on activation, but still calls onCheckedChange', () => {
    let lastChecked: boolean | undefined
    const toggle = mount(
      new Toggle({ checked: false, onCheckedChange: (checked) => (lastChecked = checked) })
    )
    try {
      toggle.a11yElement!.click()
      expect(lastChecked).toBe(true)
      // Controlled: the internal uncontrolled signal never took over, so currentSignal still
      // reflects the (unchanged) `checked` prop rather than the requested toggle.
      expect(toggle.currentSignal.peek()).toBe(false)
    } finally {
      toggle.dispose()
    }
  })

  it('activation is a no-op while disabled', () => {
    let onCheckedChangeCalls = 0
    const toggle = mount(
      new Toggle({ disabled: true, onCheckedChange: () => (onCheckedChangeCalls += 1) })
    )
    try {
      toggle.a11yElement!.click()
      expect(onCheckedChangeCalls).toBe(0)
      expect(toggle.currentSignal.peek()).toBeUndefined()
    } finally {
      toggle.dispose()
    }
  })
})
