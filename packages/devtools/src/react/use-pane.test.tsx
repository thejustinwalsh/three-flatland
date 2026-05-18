import { describe, it, expect, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, cleanup, renderHook } from '@testing-library/react'
import type { PaneBundle } from '../create-pane'

import { usePane } from './use-pane'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
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

  it('disposes the pane on real unmount', () => {
    const { result, unmount } = renderHook(() => usePane())
    const bundle = result.current
    const element = bundle.pane.element

    expect(document.body.contains(element)).toBe(true)
    expect(bundle.disposed).toBe(false)

    unmount()

    expect(bundle.disposed).toBe(true)
    expect(document.body.contains(element)).toBe(false)
  })

  it('recreates the pane after strict-mode cleanup/remount', () => {
    // Strict mode: mount → cleanup → mount on the same instance. Our
    // cleanup disposes the pane; the re-mount detects that and creates
    // a fresh bundle + force-renders so consumers see the new identity.
    // End state: exactly one pane attached to the DOM.
    let captured: PaneBundle | null = null
    function Probe() {
      const bundle = usePane()
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
    expect(bundle.disposed).toBe(false)

    // Live pane element is attached.
    expect(document.body.contains(bundle.pane.element)).toBe(true)

    // Exactly one pane in the DOM (StrictMode orphans got cleaned up).
    const allPanes = document.body.querySelectorAll('.tp-rotv')
    expect(allPanes.length).toBe(1)
  })

  it('passes the title option through to createPane', () => {
    const { result } = renderHook(() => usePane({ title: 'StrictTitle' }))
    expect(result.current.pane.element.textContent).toContain('StrictTitle')
  })
})
