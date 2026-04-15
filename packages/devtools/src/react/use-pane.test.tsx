import { describe, it, expect, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, cleanup, renderHook, act } from '@testing-library/react'
import { usePane } from './use-pane'
import type { PaneBundle } from '../create-pane'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('usePane', () => {
  it('creates a pane synchronously on first render', () => {
    const { result } = renderHook(() => usePane())

    expect(result.current).toBeDefined()
    expect(result.current.pane).toBeDefined()
    expect(result.current.pane.element).toBeInstanceOf(HTMLElement)
    expect(document.body.contains(result.current.pane.element)).toBe(true)
  })

  it('returns the same pane bundle across re-renders (stable identity)', () => {
    const { result, rerender } = renderHook(() => usePane())

    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('disposes the pane on real unmount (after the deferred-disposal microtask)', async () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => usePane())
    const bundle = result.current
    const element = bundle.pane.element

    expect(document.body.contains(element)).toBe(true)

    unmount()
    // Disposal is queued via setTimeout(..., 0); flush the timer queue.
    await act(async () => {
      vi.runAllTimers()
    })

    expect(document.body.contains(element)).toBe(false)
  })

  it('survives React strict-mode cleanup/remount without disposing the pane', async () => {
    // Strict mode mounts → cleans up → mounts again synchronously. The
    // deferred-disposal pattern (setTimeout 0) ensures the dispose check
    // happens AFTER the second mount, where mountedRef.current === true.
    vi.useFakeTimers()

    let captured: PaneBundle | null = null
    function Probe() {
      // `debug: false` opts out of the auto-mounted devtools bus panel
      // — that panel runs `setInterval` timers for ack/liveness that
      // run forever under `vi.runAllTimers()`. The test is about pane
      // lifecycle, not devtools behaviour.
      const bundle = usePane({ debug: false })
      captured = bundle
      return null
    }

    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    )

    const bundle = captured!
    expect(bundle).not.toBeNull()
    const element = bundle.pane.element

    // Flush any deferred-disposal timeouts queued by strict mode's first
    // cleanup. The remount should have set mountedRef.current = true again,
    // so the dispose-check inside the timeout sees a mounted component and
    // skips disposal.
    await act(async () => {
      vi.runAllTimers()
    })

    // The pane element is still attached — strict mode did not destroy it
    expect(document.body.contains(element)).toBe(true)
  })

  it('passes the title option through to createPane', () => {
    const { result } = renderHook(() => usePane({ title: 'StrictTitle' }))
    expect(result.current.pane.element.textContent).toContain('StrictTitle')
  })
})
