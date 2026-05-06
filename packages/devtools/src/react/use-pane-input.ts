import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { FolderApi, Pane } from 'tweakpane'

export type PaneParent = Pane | FolderApi

export interface PaneInputOptions {
  /** Minimum value (for number inputs, creates a slider) */
  min?: number
  /** Maximum value (for number inputs) */
  max?: number
  /** Step increment */
  step?: number
  /** Named options for list/dropdown binding */
  options?: Record<string, unknown>
  /** Label override (defaults to key) */
  label?: string
  /** Display as color picker */
  color?: { type: 'float' }
  /** Inverted range */
  inverted?: boolean
}

/**
 * Bind a Tweakpane input to React state.
 * Returns [value, setValue] — setValue updates both React state and the
 * Tweakpane binding.
 *
 * The binding is created in `useLayoutEffect` and rebuilt whenever
 * `parent` or `key` changes — so when `usePane` tears down and rebuilds
 * its bundle (StrictMode, true remount), this hook automatically
 * re-binds to the new pane. Cleanup disposes the binding immediately.
 */
export function usePaneInput<T>(
  parent: PaneParent | null,
  key: string,
  initialValue: T,
  options: PaneInputOptions = {},
): [T, (v: T) => void] {
  const [value, setValueState] = useState<T>(initialValue)
  const paramsRef = useRef<Record<string, unknown>>({ [key]: initialValue })
  const bindingRef = useRef<{ refresh(): void; dispose(): void } | null>(null)
  const optsRef = useRef(options)
  optsRef.current = options

  // Keep paramsRef in sync with React state — covers external setValue
  // calls between effect runs and ensures a recreated binding shows the
  // latest value (not the initial).
  paramsRef.current[key] = value

  useLayoutEffect(() => {
    if (!parent) {
      bindingRef.current = null
      return
    }

    const { label, ...bindingOpts } = optsRef.current
    const binding = parent.addBinding(paramsRef.current, key, {
      label: label ?? key,
      ...bindingOpts,
    } as Record<string, unknown>)

    binding.on('change', (ev: { value: unknown }) => {
      setValueState(ev.value as T)
    })
    bindingRef.current = binding as unknown as { refresh(): void; dispose(): void }

    return () => {
      try {
        binding.dispose()
      } catch {
        // Parent may have been disposed first (cascade). Ignore.
      }
      if (
        bindingRef.current ===
        (binding as unknown as { refresh(): void; dispose(): void })
      ) {
        bindingRef.current = null
      }
    }
    // optsRef captures the latest options without retriggering setup;
    // value isn't a dep because we sync paramsRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent, key])

  const setValue = useCallback(
    (v: T) => {
      paramsRef.current[key] = v
      setValueState(v)
      bindingRef.current?.refresh()
    },
    [key],
  )

  return [value, setValue]
}
