// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDomLiveRegionBackend } from './dom-live-region.js'

/**
 * Regression coverage for adversarial finding #9: two same-politeness announcements landing close
 * together used to cancel each other (the second's `clearTimeout` wiped the first's pending set),
 * silently dropping the first message. The fixed backend queues same-politeness messages FIFO and
 * drains one per fixed SLOT_MS slot instead of racing a single per-politeness timer.
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  for (const region of document.body.querySelectorAll('[aria-live]')) {
    region.remove()
  }
})

describe('dom-live-region backend — same-politeness queueing', () => {
  it('queues back-to-back same-politeness messages instead of cancelling — neither is lost', () => {
    const backend = createDomLiveRegionBackend()
    try {
      backend.announce({ message: 'A', politeness: 'polite' })
      backend.announce({ message: 'B', politeness: 'polite' })

      const region = document.body.querySelector('[aria-live="polite"]')
      expect(region).not.toBeNull()
      // First slot: cleared immediately.
      expect(region!.textContent).toBe('')

      vi.advanceTimersByTime(100) // t=100: first slot's set
      expect(region!.textContent).toBe('A') // A actually lands — not skipped by B's arrival

      vi.advanceTimersByTime(900) // t=1000: second slot's clear
      expect(region!.textContent).toBe('')

      vi.advanceTimersByTime(100) // t=1100: second slot's set
      expect(region!.textContent).toBe('B') // B lands too — nothing was cancelled
    } finally {
      backend.dispose()
    }
  })

  it('drains queued same-politeness messages in FIFO order', () => {
    const backend = createDomLiveRegionBackend()
    try {
      backend.announce({ message: 'first', politeness: 'polite' })
      backend.announce({ message: 'second', politeness: 'polite' })
      backend.announce({ message: 'third', politeness: 'polite' })

      const region = document.body.querySelector('[aria-live="polite"]')!
      const seen: Array<string> = []
      for (let slot = 0; slot < 3; slot++) {
        vi.advanceTimersByTime(100) // reach this slot's set
        seen.push(region.textContent ?? '')
        vi.advanceTimersByTime(900) // reach the next slot's clear (or drain-stop, on the last)
      }

      expect(seen).toEqual(['first', 'second', 'third'])
    } finally {
      backend.dispose()
    }
  })

  it('stops draining once the queue empties — no repeating timer left spinning', () => {
    const backend = createDomLiveRegionBackend()
    try {
      backend.announce({ message: 'only', politeness: 'polite' })
      vi.advanceTimersByTime(100) // settles the lone message
      expect(vi.getTimerCount()).toBe(0) // draining stopped; nothing left scheduled
    } finally {
      backend.dispose()
    }
  })

  it('dispose clears pending timers — nothing sets after dispose, no leaked timers', () => {
    const backend = createDomLiveRegionBackend()
    backend.announce({ message: 'pending', politeness: 'assertive' })
    const region = document.body.querySelector('[aria-live="assertive"]')
    expect(region).not.toBeNull()

    expect(() => backend.dispose()).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)

    // Advancing time after dispose must neither throw nor resurrect the removed region/text.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
    expect(document.body.contains(region)).toBe(false)
  })
})
