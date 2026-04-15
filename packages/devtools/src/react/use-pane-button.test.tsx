import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { claimPane, createPane, type PaneBundle } from '../create-pane'
import { usePaneButton } from './use-pane-button'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

function findButtonByLabel(bundle: PaneBundle, label: string): HTMLButtonElement | null {
  const buttons = bundle.pane.element.querySelectorAll<HTMLButtonElement>('button')
  for (const btn of buttons) {
    if (btn.textContent?.includes(label)) return btn
  }
  return null
}

describe('usePaneButton', () => {
  it('does nothing when parent is null', () => {
    const onClick = vi.fn()
    function Probe() {
      usePaneButton(null, 'Reset', onClick)
      return null
    }
    render(<Probe />)
    // No DOM, no error
    expect(onClick).not.toHaveBeenCalled()
  })

  it('adds a button to the parent on first render', () => {
    const bundle = createPane({ debug: false })
    claimPane(bundle)

    function Probe() {
      usePaneButton(bundle.pane, 'Reset', () => {})
      return null
    }

    render(<Probe />)
    expect(findButtonByLabel(bundle, 'Reset')).not.toBeNull()

    bundle.pane.dispose()
  })

  it('invokes the click callback when the button is clicked', () => {
    const bundle = createPane({ debug: false })
    claimPane(bundle)
    const onClick = vi.fn()

    function Probe() {
      usePaneButton(bundle.pane, 'GoButton', onClick)
      return null
    }

    render(<Probe />)
    const button = findButtonByLabel(bundle, 'GoButton')
    expect(button).not.toBeNull()

    act(() => {
      button!.click()
    })

    expect(onClick).toHaveBeenCalledTimes(1)

    bundle.pane.dispose()
  })

  it('always calls the LATEST callback (no stale closure)', () => {
    // Regression test for the callback-ref pattern in usePaneButton: the
    // hook stores onClick in a ref so a re-render with a new function always
    // dispatches to the latest one without re-binding the click listener.
    const bundle = createPane({ debug: false })
    claimPane(bundle)

    let counter = 0
    const handlers = [vi.fn(() => (counter = 1)), vi.fn(() => (counter = 2))]

    function Probe({ which }: { which: 0 | 1 }) {
      usePaneButton(bundle.pane, 'Latest', handlers[which]!)
      return null
    }

    const { rerender } = render(<Probe which={0} />)
    rerender(<Probe which={1} />)

    const button = findButtonByLabel(bundle, 'Latest')
    expect(button).not.toBeNull()

    act(() => {
      button!.click()
    })

    expect(handlers[0]).not.toHaveBeenCalled()
    expect(handlers[1]).toHaveBeenCalledTimes(1)
    expect(counter).toBe(2)

    bundle.pane.dispose()
  })

  it('disposes the button on real unmount (after deferred-disposal)', async () => {
    vi.useFakeTimers()
    const bundle = createPane({ debug: false })
    claimPane(bundle)

    function Probe() {
      usePaneButton(bundle.pane, 'Disposable', () => {})
      return null
    }

    const { unmount } = render(<Probe />)
    expect(findButtonByLabel(bundle, 'Disposable')).not.toBeNull()

    unmount()
    await act(async () => {
      vi.runAllTimers()
    })

    expect(findButtonByLabel(bundle, 'Disposable')).toBeNull()

    bundle.pane.dispose()
  })
})
