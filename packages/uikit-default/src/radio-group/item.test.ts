// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { RadioGroup, RadioGroupItem } from './index.js'

/**
 * Phase 2 native a11y wiring (spec §7): RadioGroupItem gets role: 'radio', ariaChecked computed
 * via searchFor(this, RadioGroup, ...) comparing this item's value to the group's selected value,
 * and its selection behavior moves from onClick to onActivate so pointer, keyboard, and AT all
 * drive selection through Component.activate().
 */

function mountGroup(
  groupProperties: ConstructorParameters<typeof RadioGroup>[0],
  items: Array<RadioGroupItem>
): RadioGroup {
  const group = new RadioGroup(groupProperties)
  new Object3D().add(group)
  for (const item of items) {
    group.add(item)
  }
  return group
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

describe('RadioGroupItem a11y wiring', () => {
  it('exposes a hidden <button role="radio"> with aria-checked reflecting the group selection', () => {
    const a = new RadioGroupItem({ value: 'a' })
    const b = new RadioGroupItem({ value: 'b' })
    const group = mountGroup({ defaultValue: 'a' }, [a, b])
    try {
      expect(a.a11yElement).toBeDefined()
      expect(a.a11yElement!.tagName).toBe('BUTTON')
      expect(a.a11yElement!.getAttribute('role')).toBe('radio')
      expect(a.a11yElement!.getAttribute('aria-checked')).toBe('true')
      expect(b.a11yElement!.getAttribute('role')).toBe('radio')
      expect(b.a11yElement!.getAttribute('aria-checked')).toBe('false')
    } finally {
      a.dispose()
      b.dispose()
      group.dispose()
    }
  })

  it('activating the hidden a11y element (AT/keyboard path) selects the item via the uncontrolled group', () => {
    const a = new RadioGroupItem({ value: 'a' })
    const b = new RadioGroupItem({ value: 'b' })
    const onValueChange: Array<string | undefined> = []
    const group = mountGroup({ onValueChange: (v) => onValueChange.push(v) }, [a, b])
    try {
      expect(a.a11yElement!.getAttribute('aria-checked')).toBe('false')
      expect(b.a11yElement!.getAttribute('aria-checked')).toBe('false')

      b.a11yElement!.click()

      expect(group.uncontrolledSignal.peek()).toBe('b')
      expect(onValueChange).toEqual(['b'])
      expect(b.a11yElement!.getAttribute('aria-checked')).toBe('true')
      expect(a.a11yElement!.getAttribute('aria-checked')).toBe('false')
    } finally {
      a.dispose()
      b.dispose()
      group.dispose()
    }
  })

  it('does not flip a controlled group on activation, but still calls onValueChange', () => {
    const a = new RadioGroupItem({ value: 'a' })
    const b = new RadioGroupItem({ value: 'b' })
    const onValueChange: Array<string | undefined> = []
    const group = mountGroup({ value: 'a', onValueChange: (v) => onValueChange.push(v) }, [a, b])
    try {
      b.a11yElement!.click()
      expect(onValueChange).toEqual(['b'])
      // Controlled `value` prop stays 'a' — aria-checked reflects the group's controlled value.
      expect(a.a11yElement!.getAttribute('aria-checked')).toBe('true')
      expect(b.a11yElement!.getAttribute('aria-checked')).toBe('false')
    } finally {
      a.dispose()
      b.dispose()
      group.dispose()
    }
  })

  it('writing the group value signal updates aria-checked on the previously/newly selected items', () => {
    const a = new RadioGroupItem({ value: 'a' })
    const b = new RadioGroupItem({ value: 'b' })
    const group = mountGroup({ defaultValue: 'a' }, [a, b])
    try {
      expect(a.a11yElement!.getAttribute('aria-checked')).toBe('true')
      expect(b.a11yElement!.getAttribute('aria-checked')).toBe('false')

      group.uncontrolledSignal.value = 'b'

      expect(a.a11yElement!.getAttribute('aria-checked')).toBe('false')
      expect(b.a11yElement!.getAttribute('aria-checked')).toBe('true')
    } finally {
      a.dispose()
      b.dispose()
      group.dispose()
    }
  })

  it('is a no-op when disabled — activation does not select the item', () => {
    const a = new RadioGroupItem({ value: 'a', disabled: true })
    const onValueChange: Array<string | undefined> = []
    const group = mountGroup({ onValueChange: (v) => onValueChange.push(v) }, [a])
    try {
      a.a11yElement!.click()
      expect(onValueChange).toEqual([])
      expect(group.uncontrolledSignal.peek()).toBeUndefined()
    } finally {
      a.dispose()
      group.dispose()
    }
  })
})
