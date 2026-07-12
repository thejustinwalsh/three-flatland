// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { signal } from '@preact/signals-core'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Container, Input } from '../index.js'
import { registerAnnouncementBackend } from '../a11y/announce/announcer.js'

/**
 * The semantic activation contract (spec §2), the load-bearing cross-mode path. Regression cover for
 * the Codex Phase-0 review: onActivate must actually be wired (it was dead), pointer and keyboard
 * must fire onActivate → onClick in the SAME order, the compat synthetic click must be marked
 * synthetic, a synchronous disable inside onActivate must suppress that compat click, and Input must
 * expose its hidden <input> as a11yElement.
 */

function mount(properties: ConstructorParameters<typeof Container>[0]): Container {
  const container = new Container(properties)
  new Object3D().add(container)
  return container
}

let realFetch: typeof globalThis.fetch
beforeAll(async () => {
  await loadYoga() // loads the Yoga WASM via fetch — must run BEFORE fetch is stubbed
  // Input/Text kick off a default-font fetch on construction; there is no server in tests, so pin
  // fetch to a never-settling promise to keep the async font load from logging ECONNREFUSED noise.
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

describe('semantic activation', () => {
  it('wires a prop onActivate — activate() invokes it (regression: onActivate was never bound)', () => {
    const onActivate = vi.fn()
    const c = mount({ role: 'button', ariaLabel: 'Go', onActivate })
    try {
      c.activate()
      expect(onActivate).toHaveBeenCalledTimes(1)
      expect(onActivate.mock.calls[0]![0]).toMatchObject({ type: 'activate', source: 'keyboard' })
    } finally {
      c.dispose()
    }
  })

  it('fires onActivate before onClick for BOTH keyboard and pointer (cross-mode order)', () => {
    // Keyboard/AT: activate() → onActivate, then the compat synthetic click → onClick.
    const keyboard: Array<string> = []
    const kb = mount({
      role: 'button',
      ariaLabel: 'K',
      onActivate: () => keyboard.push('activate'),
      onClick: () => keyboard.push('click'),
    })
    try {
      kb.activate()
      expect(keyboard).toEqual(['activate', 'click'])
    } finally {
      kb.dispose()
    }

    // Pointer: a real (non-synthetic) click delegates to activate BEFORE the legacy onClick runs.
    const pointer: Array<string> = []
    const pt = mount({
      role: 'button',
      ariaLabel: 'P',
      onActivate: () => pointer.push('activate'),
      onClick: () => pointer.push('click'),
    })
    try {
      pt.dispatchEvent({ type: 'click' } as never)
      expect(pointer).toEqual(['activate', 'click'])
    } finally {
      pt.dispose()
    }
  })

  it('emits a compat synthetic click (marked synthetic) for non-pointer activation', () => {
    const clicks: Array<{ synthetic?: boolean; source?: string }> = []
    const c = mount({ role: 'button', ariaLabel: 'Go', onClick: (e) => clicks.push(e as never) })
    try {
      c.activate() // keyboard
      expect(clicks).toHaveLength(1)
      expect(clicks[0]!.synthetic).toBe(true)
      expect(clicks[0]!.source).toBe('keyboard')
    } finally {
      c.dispose()
    }
  })

  it('does not fire the compat click when onActivate synchronously disables the component', () => {
    const disabled = signal(false)
    const calls: Array<string> = []
    const c = mount({
      role: 'button',
      ariaLabel: 'Go',
      disabled,
      onActivate: () => {
        disabled.value = true
        calls.push('activate')
      },
      onClick: () => calls.push('click'),
    })
    try {
      c.activate()
      // onActivate ran and disabled the control mid-activation → the compat click is suppressed.
      expect(calls).toEqual(['activate'])
    } finally {
      c.dispose()
    }
  })

  it('still announces (and does not throw out of activate) when a legacy onClick throws', () => {
    // Regression from the live probe: navigator.clipboard.writeText threw on an insecure origin
    // inside the compat synthetic click, which aborted dispatchActivation before the announcement.
    const announced: Array<string> = []
    const unregister = registerAnnouncementBackend({ announce: (a) => announced.push(a.message) })
    const c = mount({
      role: 'button',
      ariaLabel: 'Copy',
      activationMessage: 'Copied 3 items',
      onClick: () => {
        throw new Error('boom')
      },
    })
    try {
      expect(() => c.activate()).not.toThrow()
      expect(announced).toContain('Copied 3 items')
    } finally {
      unregister()
      c.dispose()
    }
  })

  it('is a no-op when the component is already disabled', () => {
    const onActivate = vi.fn()
    const onClick = vi.fn()
    const c = mount({ role: 'button', ariaLabel: 'Go', disabled: true, onActivate, onClick })
    try {
      c.activate()
      expect(onActivate).not.toHaveBeenCalled()
      expect(onClick).not.toHaveBeenCalled()
    } finally {
      c.dispose()
    }
  })
})

describe('Input exposes its hidden input as a11yElement', () => {
  it('sets a11yElement to the hidden <input> (regression: it was left undefined)', () => {
    const input = new Input({ ariaLabel: 'Search' })
    new Object3D().add(input)
    try {
      expect(input.a11yElement).toBe(input.element)
      expect(input.element.tagName).toBe('INPUT')
    } finally {
      input.dispose()
    }
  })
})
