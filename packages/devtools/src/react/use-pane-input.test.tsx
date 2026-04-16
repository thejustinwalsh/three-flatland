import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, renderHook, act } from '@testing-library/react'
import { claimPane, createPane, type PaneBundle } from '../create-pane'
import { usePaneInput } from './use-pane-input'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function withParent<T>(fn: (bundle: PaneBundle) => T): T {
  const bundle = createPane({})
  claimPane(bundle)
  try {
    return fn(bundle)
  } finally {
    try {
      bundle.pane.dispose()
    } catch {
      /* already disposed */
    }
  }
}

describe('usePaneInput', () => {
  it('returns the initial value before any input', () => {
    withParent((bundle) => {
      const { result } = renderHook(() => usePaneInput(bundle.pane, 'count', 5))
      const [value] = result.current
      expect(value).toBe(5)
    })
  })

  it('returns null-parent variant without crashing', () => {
    const { result } = renderHook(() => usePaneInput(null, 'count', 5))
    const [value] = result.current
    // No parent means no binding, but state still works
    expect(value).toBe(5)
  })

  it('setValue updates React state to the new value', () => {
    withParent((bundle) => {
      const { result } = renderHook(() =>
        usePaneInput(bundle.pane, 'speed', 1, { min: 0, max: 10 }),
      )

      act(() => {
        const [, setValue] = result.current
        setValue(7)
      })

      const [value] = result.current
      expect(value).toBe(7)
    })
  })

  it('setValue is stable across re-renders (memoized via useCallback)', () => {
    withParent((bundle) => {
      const { result, rerender } = renderHook(() =>
        usePaneInput(bundle.pane, 'k', 0),
      )
      const firstSetValue = result.current[1]
      rerender()
      expect(result.current[1]).toBe(firstSetValue)
    })
  })

  it('uses the label option in the rendered control', () => {
    withParent((bundle) => {
      renderHook(() => usePaneInput(bundle.pane, 'speed', 1, { label: 'Speed' }))
      // The label appears in the pane DOM
      expect(bundle.pane.element.textContent).toContain('Speed')
    })
  })

  it('falls back to using the key as the label when no label is provided', () => {
    withParent((bundle) => {
      renderHook(() => usePaneInput(bundle.pane, 'rotation', 0))
      expect(bundle.pane.element.textContent).toContain('rotation')
    })
  })

  it('disposes the binding on real unmount', () => {
    const bundle = createPane({})
    claimPane(bundle)

    function Probe() {
      usePaneInput(bundle.pane, 'k', 0)
      return null
    }

    const { unmount } = render(<Probe />)
    // Snapshot the binding count by counting children of the pane rack
    const beforeUnmountCount = bundle.pane.element.querySelectorAll('.tp-lblv').length
    expect(beforeUnmountCount).toBeGreaterThan(0)

    unmount()

    const afterUnmountCount = bundle.pane.element.querySelectorAll('.tp-lblv').length
    // Cleanup synchronously removes the binding from the pane DOM.
    expect(afterUnmountCount).toBeLessThan(beforeUnmountCount)

    bundle.pane.dispose()
  })

  it('survives multiple renders without re-creating the binding', () => {
    withParent((bundle) => {
      const { result, rerender } = renderHook(() =>
        usePaneInput(bundle.pane, 'k', 0),
      )

      const lblvCountAfterFirst = bundle.pane.element.querySelectorAll('.tp-lblv').length

      rerender()
      rerender()
      rerender()

      const lblvCountAfterMany = bundle.pane.element.querySelectorAll('.tp-lblv').length
      expect(lblvCountAfterMany).toBe(lblvCountAfterFirst)
      // value still reflects state
      expect(result.current[0]).toBe(0)
    })
  })

  it('rebinds when parent identity changes (e.g., pane recreated)', () => {
    const a = createPane({})
    claimPane(a)
    const b = createPane({})
    claimPane(b)

    let parent: PaneBundle = a
    const { result, rerender } = renderHook(() =>
      usePaneInput(parent.pane, 'k', 0, { label: 'Knob' }),
    )

    // Initially bound to A
    expect(a.pane.element.textContent).toContain('Knob')
    expect(b.pane.element.textContent).not.toContain('Knob')

    // Update value through React API; binding on A reflects it.
    act(() => {
      result.current[1](7)
    })
    expect(result.current[0]).toBe(7)

    // Swap parent — should dispose A's binding and create one on B,
    // carrying the current value (7) over via paramsRef sync.
    parent = b
    rerender()

    expect(a.pane.element.textContent).not.toContain('Knob')
    expect(b.pane.element.textContent).toContain('Knob')
    expect(result.current[0]).toBe(7)

    a.pane.dispose()
    b.pane.dispose()
  })
})
