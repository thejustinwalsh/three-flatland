// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Checkbox } from './index.js'

/**
 * T2.1 — the checkbox widget wires the frozen a11y contract (spec §7): `role: 'checkbox'`,
 * `ariaChecked` synced from `currentSignal`, and the toggle body moved from `onClick` to
 * `onActivate` so pointer, keyboard, AT, and future XR activation all share one handler.
 */

function mount(properties?: ConstructorParameters<typeof Checkbox>[0]): Checkbox {
  const checkbox = new Checkbox(properties)
  new Object3D().add(checkbox)
  return checkbox
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

describe('Checkbox a11y wiring', () => {
  it('mounts a hidden <button role="checkbox"> with aria-checked reflecting currentSignal', () => {
    const checkbox = mount()
    try {
      const el = checkbox.a11yElement
      expect(el).toBeDefined()
      expect(el!.tagName).toBe('BUTTON')
      expect(el!.getAttribute('role')).toBe('checkbox')
      expect(el!.getAttribute('aria-checked')).toBe('false')
    } finally {
      checkbox.dispose()
    }
  })

  it('reflects defaultChecked in aria-checked on mount', () => {
    const checkbox = mount({ defaultChecked: true })
    try {
      expect(checkbox.a11yElement!.getAttribute('aria-checked')).toBe('true')
    } finally {
      checkbox.dispose()
    }
  })

  it('clicking the hidden a11y element flips the uncontrolled state through activate()', () => {
    const onCheckedChange: Array<boolean> = []
    const checkbox = mount({ onCheckedChange: (checked) => onCheckedChange.push(checked) })
    try {
      expect(checkbox.currentSignal.peek()).toBeUndefined()

      checkbox.a11yElement!.click()
      expect(checkbox.currentSignal.peek()).toBe(true)
      expect(checkbox.uncontrolledSignal.peek()).toBe(true)
      expect(onCheckedChange).toEqual([true])
      expect(checkbox.a11yElement!.getAttribute('aria-checked')).toBe('true')

      checkbox.a11yElement!.click()
      expect(checkbox.currentSignal.peek()).toBe(false)
      expect(onCheckedChange).toEqual([true, false])
      expect(checkbox.a11yElement!.getAttribute('aria-checked')).toBe('false')
    } finally {
      checkbox.dispose()
    }
  })

  it('does not flip local state when controlled (checked prop set) — only notifies via onCheckedChange', () => {
    const onCheckedChange: Array<boolean> = []
    const checkbox = mount({ checked: false, onCheckedChange: (checked) => onCheckedChange.push(checked) })
    try {
      checkbox.a11yElement!.click()
      expect(checkbox.uncontrolledSignal.peek()).toBeUndefined()
      expect(onCheckedChange).toEqual([true])
      // Still reflects the controlled `checked` prop (false), not the requested toggle.
      expect(checkbox.currentSignal.peek()).toBe(false)
    } finally {
      checkbox.dispose()
    }
  })

  it('writing the checked signal updates the aria-checked attribute', () => {
    const checkbox = mount()
    try {
      expect(checkbox.a11yElement!.getAttribute('aria-checked')).toBe('false')
      checkbox.uncontrolledSignal.value = true
      expect(checkbox.a11yElement!.getAttribute('aria-checked')).toBe('true')
      checkbox.uncontrolledSignal.value = false
      expect(checkbox.a11yElement!.getAttribute('aria-checked')).toBe('false')
    } finally {
      checkbox.dispose()
    }
  })

  it('is a no-op when disabled — activation does not toggle state', () => {
    const onCheckedChange: Array<boolean> = []
    const checkbox = mount({ disabled: true, onCheckedChange: (checked) => onCheckedChange.push(checked) })
    try {
      checkbox.a11yElement!.click()
      expect(onCheckedChange).toEqual([])
      expect(checkbox.currentSignal.peek()).toBeUndefined()
    } finally {
      checkbox.dispose()
    }
  })
})
