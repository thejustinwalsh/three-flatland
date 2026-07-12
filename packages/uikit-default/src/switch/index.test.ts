// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { signal } from '@preact/signals-core'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Switch } from './index.js'

/**
 * T2.2 (planning/superpowers/specs/uikit-native-a11y.md §7): Switch gets role:'switch',
 * ariaChecked mirroring currentSignal, and its toggle behavior moved from onClick to
 * onActivate so pointer, keyboard, AT, and XR activation all share one code path.
 */

function mount(properties?: ConstructorParameters<typeof Switch>[0]): Switch {
  const widget = new Switch(properties)
  new Object3D().add(widget)
  return widget
}

beforeAll(async () => {
  await loadYoga()
})

afterEach(() => {
  for (const el of document.querySelectorAll('[data-uikit-a11y]')) {
    el.remove()
  }
})

describe('Switch — native a11y wiring', () => {
  it('exposes role=switch with aria-checked mirroring currentSignal (defaults to false)', () => {
    const w = mount()
    try {
      const el = w.a11yElement as HTMLButtonElement
      expect(el.tagName).toBe('BUTTON')
      expect(el.getAttribute('role')).toBe('switch')
      expect(el.getAttribute('aria-checked')).toBe('false')
    } finally {
      w.dispose()
    }
  })

  it('a click on the hidden element drives the uncontrolled toggle through onActivate', () => {
    const onCheckedChange = vi.fn()
    const w = mount({ onCheckedChange })
    try {
      const el = w.a11yElement as HTMLButtonElement
      expect(el.getAttribute('aria-checked')).toBe('false')

      el.click()

      expect(w.currentSignal.value).toBe(true)
      expect(onCheckedChange).toHaveBeenCalledTimes(1)
      expect(onCheckedChange).toHaveBeenCalledWith(true)
      expect(el.getAttribute('aria-checked')).toBe('true')

      el.click()

      expect(w.currentSignal.value).toBe(false)
      expect(onCheckedChange).toHaveBeenCalledTimes(2)
      expect(onCheckedChange).toHaveBeenLastCalledWith(false)
      expect(el.getAttribute('aria-checked')).toBe('false')
    } finally {
      w.dispose()
    }
  })

  it('writing the checked signal (controlled) updates aria-checked reactively', () => {
    const checked = signal(false)
    const w = mount({ checked })
    try {
      const el = w.a11yElement as HTMLButtonElement
      expect(el.getAttribute('aria-checked')).toBe('false')

      checked.value = true
      expect(el.getAttribute('aria-checked')).toBe('true')

      checked.value = false
      expect(el.getAttribute('aria-checked')).toBe('false')
    } finally {
      w.dispose()
    }
  })

  it('a click does not toggle a controlled switch — onCheckedChange still fires (parent owns state)', () => {
    const checked = signal(true)
    const onCheckedChange = vi.fn()
    const w = mount({ checked, onCheckedChange })
    try {
      const el = w.a11yElement as HTMLButtonElement
      expect(el.getAttribute('aria-checked')).toBe('true')

      el.click()

      expect(onCheckedChange).toHaveBeenCalledWith(false)
      // controlled: the source-of-truth signal was not written by the widget, so state holds.
      expect(el.getAttribute('aria-checked')).toBe('true')
    } finally {
      w.dispose()
    }
  })

  it('disabled suppresses activation entirely (no onActivate call, no state change)', () => {
    const onCheckedChange = vi.fn()
    const w = mount({ disabled: true, onCheckedChange })
    try {
      const el = w.a11yElement as HTMLButtonElement
      el.click()
      expect(onCheckedChange).not.toHaveBeenCalled()
      expect(el.getAttribute('aria-checked')).toBe('false')
    } finally {
      w.dispose()
    }
  })
})
