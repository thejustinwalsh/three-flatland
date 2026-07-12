// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { signal } from '@preact/signals-core'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Slider } from './index.js'

/**
 * T2.6: role:'slider' + ariaValueNow/Min/Max/Step on the hidden native <input type=range>, and
 * onA11yValueChange running through the SAME clamp/step/set path as pointer drag. A Component only
 * resolves its properties (and thus mounts its a11y element) once root-attached (see
 * uikit/src/tests/a11y-hidden-element.test.ts mount helper).
 */

function mount(properties: ConstructorParameters<typeof Slider>[0]): Slider {
  const slider = new Slider(properties)
  new Object3D().add(slider)
  return slider
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

describe('Slider a11y', () => {
  it('exposes role slider as a hidden <input type=range> with aria-value* synced from props', () => {
    const s = mount({ ariaLabel: 'Volume', value: 25, min: 0, max: 50, step: 5 })
    try {
      const el = s.a11yElement as HTMLInputElement
      expect(el).toBeDefined()
      expect(el.tagName).toBe('INPUT')
      expect(el.type).toBe('range')
      expect(el.min).toBe('0')
      expect(el.max).toBe('50')
      expect(el.step).toBe('5')
      expect(el.value).toBe('25')
    } finally {
      s.dispose()
    }
  })

  it('defaults ariaValueMin/Max/Step to 0/100/1 when min/max/step are absent', () => {
    const s = mount({ ariaLabel: 'Volume' })
    try {
      const el = s.a11yElement as HTMLInputElement
      expect(el.min).toBe('0')
      expect(el.max).toBe('100')
      expect(el.step).toBe('1')
    } finally {
      s.dispose()
    }
  })

  it('writing the value signal updates the aria-value-now (native input value)', () => {
    const value = signal(20)
    const s = mount({ ariaLabel: 'Volume', value, min: 0, max: 100, step: 1 })
    try {
      const el = s.a11yElement as HTMLInputElement
      expect(el.value).toBe('20')
      value.value = 40
      expect(el.value).toBe('40')
    } finally {
      s.dispose()
    }
  })

  it('onA11yValueChange runs the same clamp/step/set path as pointer drag (uncontrolled)', () => {
    const onValueChange = vi.fn()
    const s = mount({ ariaLabel: 'Volume', min: 0, max: 100, step: 5, onValueChange })
    try {
      const el = s.a11yElement as HTMLInputElement
      el.valueAsNumber = 73 // AT/keyboard-driven raw value, not pre-stepped by us
      el.dispatchEvent(new Event('input', { bubbles: true }))
      // rounded to the nearest step of 5, clamped within [0, 100] — same math as handleSetValue
      expect(onValueChange).toHaveBeenCalledWith(75)
      expect(s.currentSignal.value).toBe(75)
    } finally {
      s.dispose()
    }
  })

  it('onA11yValueChange clamps to max and does not write the uncontrolledSignal when controlled', () => {
    const onValueChange = vi.fn()
    const value = signal(10)
    const s = mount({ ariaLabel: 'Volume', value, min: 0, max: 100, step: 10, onValueChange })
    try {
      const el = s.a11yElement as HTMLInputElement
      el.valueAsNumber = 250
      el.dispatchEvent(new Event('input', { bubbles: true }))
      expect(onValueChange).toHaveBeenCalledWith(100)
      // controlled: the prop signal, not the internal uncontrolled one, is the source of truth
      expect(s.uncontrolledSignal.value).toBeUndefined()
      expect(s.currentSignal.value).toBe(10)
    } finally {
      s.dispose()
    }
  })

  it('does not commit a value change while disabled', () => {
    const onValueChange = vi.fn()
    const s = mount({ ariaLabel: 'Volume', disabled: true, onValueChange })
    try {
      const el = s.a11yElement as HTMLInputElement
      el.valueAsNumber = 42
      el.dispatchEvent(new Event('input', { bubbles: true }))
      expect(onValueChange).not.toHaveBeenCalled()
    } finally {
      s.dispose()
    }
  })
})
