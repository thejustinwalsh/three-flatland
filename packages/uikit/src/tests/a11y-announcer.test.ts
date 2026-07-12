// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  announce,
  registerAnnouncementBackend,
  type Announcement,
  type AnnouncementBackend,
} from '../a11y/announce/announcer.js'
import { createDomLiveRegionBackend } from '../a11y/announce/backends/dom-live-region.js'

/**
 * The announcement registry + the default DOM live-region backend (spec §6). The registry is a
 * module singleton, so every test registers its OWN backend and unregisters it, and none of them
 * lets the global `announce()` auto-register the default DOM backend on an empty registry (which
 * would persist for the rest of the file). The re-announce / lifecycle behaviour is driven on the
 * DOM backend directly.
 */

afterEach(() => {
  // Belt-and-suspenders: clear any live regions a backend (or a stray auto-register) left behind.
  for (const region of document.body.querySelectorAll('[aria-live]')) {
    region.remove()
  }
})

describe('announcement registry', () => {
  it('is a silent no-op without a DOM and with no backend (SSR guard)', () => {
    // First test in the file: module state is pristine — no backend, auto-register untried. With
    // `document` undefined the auto-register is skipped and there are no backends, so this must do
    // nothing rather than throw.
    vi.stubGlobal('document', undefined)
    try {
      expect(() => announce('nobody hears this')).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('routes a message to every registered backend, carrying politeness/kind', () => {
    const received: Array<Announcement> = []
    const unregister = registerAnnouncementBackend({ announce: (a) => received.push(a) })
    try {
      announce('saved', { politeness: 'assertive', kind: 'status' })
      announce('plain') // politeness defaults to polite
      expect(received).toHaveLength(2)
      expect(received[0]).toMatchObject({
        message: 'saved',
        politeness: 'assertive',
        kind: 'status',
      })
      expect(received[1]).toMatchObject({ message: 'plain', politeness: 'polite' })
    } finally {
      unregister()
    }
  })

  it('unregister stops delivery and disposes the backend exactly once', () => {
    // A sentinel keeps the registry non-empty, so the `announce('after')` below routes to a live
    // registry rather than tripping the empty-registry DOM auto-register.
    const removeSentinel = registerAnnouncementBackend({ announce: () => {} })
    const received: Array<string> = []
    const dispose = vi.fn()
    const backend: AnnouncementBackend = { announce: (a) => received.push(a.message), dispose }
    const unregister = registerAnnouncementBackend(backend)
    try {
      announce('before')
      unregister()
      announce('after')

      expect(received).toEqual(['before'])
      expect(dispose).toHaveBeenCalledTimes(1)
      // Idempotent: a second unregister must not dispose again.
      unregister()
      expect(dispose).toHaveBeenCalledTimes(1)
    } finally {
      removeSentinel()
    }
  })
})

describe('DOM live-region backend', () => {
  // The backend clears text then re-sets it ~100ms later; happy-dom's real timer is used (vitest's
  // fake timers do not intercept it reliably), so the settle is awaited rather than fast-forwarded.
  const SETTLE_MS = 130

  it('clears then sets text ~100ms later so an identical repeat still re-announces', async () => {
    const backend = createDomLiveRegionBackend()
    try {
      backend.announce({ message: 'downloading', politeness: 'polite' })
      const region = document.body.querySelector('[aria-live="polite"]')
      expect(region).not.toBeNull()
      expect(region!.getAttribute('aria-atomic')).toBe('true')
      // Cleared immediately; the text only lands after the settle.
      expect(region!.textContent).toBe('')
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
      expect(region!.textContent).toBe('downloading')

      // Same message again: clears, then re-sets — the repeat re-announces.
      backend.announce({ message: 'downloading', politeness: 'polite' })
      expect(region!.textContent).toBe('')
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
      expect(region!.textContent).toBe('downloading')
    } finally {
      backend.dispose?.()
    }
  })

  it('keeps a separate region per politeness level', () => {
    const backend = createDomLiveRegionBackend()
    try {
      backend.announce({ message: 'gentle', politeness: 'polite' })
      backend.announce({ message: 'urgent', politeness: 'assertive' })
      expect(document.body.querySelector('[aria-live="polite"]')).not.toBeNull()
      expect(document.body.querySelector('[aria-live="assertive"]')).not.toBeNull()
    } finally {
      backend.dispose?.()
    }
  })

  it('dispose removes its regions and a pending settle never resurrects them', async () => {
    const backend = createDomLiveRegionBackend()
    backend.announce({ message: 'pending', politeness: 'assertive' })
    expect(document.body.querySelector('[aria-live="assertive"]')).not.toBeNull()

    expect(() => backend.dispose?.()).not.toThrow()
    expect(document.body.querySelector('[aria-live="assertive"]')).toBeNull()
    // Whether or not the cancelled timer fires, the removed region must not reappear.
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
    expect(document.body.querySelector('[aria-live="assertive"]')).toBeNull()
  })
})
