import { describe, it, expect, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, cleanup, renderHook } from '@testing-library/react'
import { claimPane, createPane, type PaneBundle } from '../create-pane'
import { usePane } from './use-pane'
import { usePaneFolder } from './use-pane-folder'



afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

// usePaneFolder needs a parent (Pane | FolderApi). The simplest fixture
// is a real createPane bundle that we claim and tear down per-test.
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

  it('creates a folder after the layout effect commits', () => {
    withParent((bundle) => {
      const { result } = renderHook(() => usePaneFolder(bundle.pane, 'MyFolder'))
      // After mount + layout effect + setState re-render, folder is set.
      expect(result.current).not.toBeNull()
      expect(bundle.pane.element.textContent).toContain('MyFolder')
    })
  })

  it('returns the same folder across re-renders (no parent change)', () => {
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

  it('disposes the folder on real unmount', () => {
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

    expect(disposeSpy).toHaveBeenCalled()

    bundle.pane.dispose()
  })

  it('produces a single live folder after strict-mode cycle', () => {
    // Symmetric cleanup means strict mode disposes the first folder and
    // creates a fresh one. End state: one folder labeled "StrictFolder"
    // visible in the pane.
    const bundle = createPane({})
    claimPane(bundle)

    function Probe() {
      usePaneFolder(bundle.pane, 'StrictFolder')
      return null
    }

    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    )

    const labels = bundle.pane.element.querySelectorAll('.tp-fldv_t')
    const titles = Array.from(labels).map((el) => el.textContent)
    expect(titles.filter((t) => t === 'StrictFolder').length).toBe(1)

    bundle.pane.dispose()
  })

  it('integrates with usePane: folder is added to the pane element', () => {
    function Probe() {
      const { pane } = usePane()
      usePaneFolder(pane, 'Integrated')
      return null
    }

    render(<Probe />)
    const panes = document.body.querySelectorAll('.tp-rotv')
    expect(panes.length).toBeGreaterThan(0)
    expect(document.body.textContent).toContain('Integrated')
  })
})
