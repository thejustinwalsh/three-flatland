import { describe, it, expect, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, cleanup, renderHook, act } from '@testing-library/react'
import { claimPane, createPane, type PaneBundle } from '../create-pane'
import { usePane } from './use-pane'
import { usePaneFolder } from './use-pane-folder'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.useRealTimers()
})

// usePaneFolder needs a parent (Pane | FolderApi). The simplest fixture is a
// real createPane bundle that we claim and tear down per-test.
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

describe('usePaneFolder', () => {
  it('returns null when parent is null', () => {
    const { result } = renderHook(() => usePaneFolder(null, 'Folder'))
    expect(result.current).toBeNull()
  })

  it('creates a folder synchronously on first render with a parent', () => {
    withParent((bundle) => {
      const { result } = renderHook(() => usePaneFolder(bundle.pane, 'MyFolder'))
      expect(result.current).not.toBeNull()
      // The folder element should be inside the pane's DOM tree
      expect(bundle.pane.element.textContent).toContain('MyFolder')
    })
  })

  it('returns the same folder across re-renders', () => {
    withParent((bundle) => {
      const { result, rerender } = renderHook(() =>
        usePaneFolder(bundle.pane, 'StableFolder'),
      )
      const first = result.current
      rerender()
      expect(result.current).toBe(first)
    })
  })

  it('respects the expanded option', () => {
    withParent((bundle) => {
      const { result } = renderHook(() =>
        usePaneFolder(bundle.pane, 'Expanded', { expanded: true }),
      )
      expect(result.current?.expanded).toBe(true)
    })
  })

  it('disposes the folder on real unmount (after deferred-disposal microtask)', async () => {
    vi.useFakeTimers()

    const bundle = createPane({})
    claimPane(bundle)

    let captured: ReturnType<typeof usePaneFolder> = null
    function Probe() {
      const folder = usePaneFolder(bundle.pane, 'Disposable')
      captured = folder
      return null
    }

    const { unmount } = render(<Probe />)
    expect(captured).not.toBeNull()
    const folder = captured!
    const disposeSpy = vi.spyOn(folder, 'dispose')

    unmount()
    await act(async () => {
      vi.runOnlyPendingTimers()
    })

    expect(disposeSpy).toHaveBeenCalled()

    bundle.pane.dispose()
  })

  it('survives strict-mode cleanup/remount without disposing the folder', async () => {
    vi.useFakeTimers()

    const bundle = createPane({})
    claimPane(bundle)

    let captured: ReturnType<typeof usePaneFolder> = null
    function Probe() {
      const folder = usePaneFolder(bundle.pane, 'StrictFolder')
      captured = folder
      return null
    }

    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    )

    const folder = captured!
    expect(folder).not.toBeNull()
    const disposeSpy = vi.spyOn(folder, 'dispose')

    await act(async () => {
      vi.runOnlyPendingTimers()
    })

    // Strict mode mount → cleanup → mount: the deferred check sees a remounted
    // component and skips dispose.
    expect(disposeSpy).not.toHaveBeenCalled()

    bundle.pane.dispose()
  })

  it('integrates with usePane: folder is added to the pane element', () => {
    function Probe() {
      const { pane } = usePane()
      usePaneFolder(pane, 'Integrated')
      return null
    }

    render(<Probe />)
    // The pane is created during render and the folder is added during render
    const panes = document.body.querySelectorAll('.tp-rotv')
    expect(panes.length).toBeGreaterThan(0)
    // The folder label appears in the DOM
    expect(document.body.textContent).toContain('Integrated')
  })
})
