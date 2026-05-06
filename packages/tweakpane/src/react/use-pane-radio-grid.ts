import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaneParent } from './use-pane-input.js'

export interface PaneRadioGridCell<T> {
  /** Visible label on the button. */
  title: string
  /** Value emitted by this cell when selected. */
  value: T
}

export interface PaneRadioGridOptions<T> {
  /** Radio-group name. Required by Tweakpane — any unique string works. */
  groupName?: string
  /** Initially-selected value. Must match one of `cells[i].value`. */
  initialValue: T
  /**
   * Grid cells in row-major order. Default layout is a single row with
   * `cells.length` columns, matching a top-of-pane toggle bar.
   */
  cells: ReadonlyArray<PaneRadioGridCell<T>>
  /** Explicit `[cols, rows]`. Defaults to `[cells.length, 1]`. */
  size?: [number, number]
}

/**
 * Render an inline button-bar selector backed by the Tweakpane Essentials
 * `radiogrid` blade. Returns `[value, setValue]` — interacting with the
 * pane buttons updates React state, and `setValue` pushes back into the
 * blade. Intended for scene/mode toggles where a dropdown feels too
 * heavyweight and a row of labeled buttons reads better.
 *
 * Disposal is deferred through `setTimeout(0)` so the blade survives
 * React strict-mode's synchronous cleanup/re-mount pair.
 */
export function usePaneRadioGrid<T>(
  parent: PaneParent | null,
  options: PaneRadioGridOptions<T>,
): [T, (v: T) => void] {
  const { cells, initialValue, groupName, size } = options
  const [value, setValueState] = useState<T>(initialValue)

  const bladeRef = useRef<{ dispose(): void; on: (ev: string, fn: (e: { value: T }) => void) => unknown; value?: T } | null>(null)
  const cellsRef = useRef(cells)
  cellsRef.current = cells
  const mountedRef = useRef(false)

  const ensureBlade = useCallback(() => {
    if (!parent || bladeRef.current) return

    const [cols, rows] = size ?? [cells.length, 1]
    const bag = { value: initialValue }
    const blade = (parent as unknown as {
      addBlade: (opts: Record<string, unknown>) => typeof bladeRef.current
    }).addBlade({
      view: 'radiogrid',
      groupName: groupName ?? `radio-${Math.random().toString(36).slice(2, 10)}`,
      size: [cols, rows],
      cells: (x: number, y: number) => {
        const idx = y * cols + x
        const cell = cellsRef.current[idx]
        return cell ? { title: cell.title, value: cell.value } : { title: '', value: undefined }
      },
      value: bag.value,
    })

    blade?.on('change', (ev) => {
      setValueState(ev.value)
    })
    bladeRef.current = blade
  }, [parent, groupName, initialValue, cells.length, size])

  // Synchronous creation so the toggle bar appears on first paint.
  if (parent && bladeRef.current === null) ensureBlade()

  useEffect(() => {
    mountedRef.current = true
    if (parent && bladeRef.current === null) ensureBlade()

    return () => {
      const blade = bladeRef.current
      setTimeout(() => {
        if (!mountedRef.current && blade) {
          blade.dispose()
          if (bladeRef.current === blade) bladeRef.current = null
        }
      }, 0)
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent])

  const setValue = useCallback((v: T) => {
    setValueState(v)
    const blade = bladeRef.current as (typeof bladeRef.current & { value?: T }) | null
    if (blade && 'value' in blade) blade.value = v
  }, [])

  return [value, setValue]
}
