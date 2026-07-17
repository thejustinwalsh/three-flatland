import { useCallback, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
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
  /**
   * Render as a read-only monitor (no interactive editor). Value still
   * updates when `setValue` is called; tweakpane repaints on refresh.
   */
  readonly?: boolean
  /**
   * Custom display formatter (e.g. `(v) => v.toFixed(2)`). Forwarded to
   * tweakpane's native `format` option.
   */
  format?: (value: number) => string
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
  options: PaneInputOptions = {}
): [T, (v: T) => void] {
  const [value, setValueState] = useState<T>(initialValue)
  const paramsRef = useRef<Record<string, unknown>>({ [key]: initialValue })
  const bindingRef = useRef<{ refresh(): void; dispose(): void } | null>(null)

  // Capture the latest options + value non-reactively, read only when the
  // binding is (re)created. useEffectEvent avoids touching refs during
  // render while keeping options/value out of the effect's dep list (so
  // they don't retrigger setup). tweakpane writes the bound object back on
  // its own change events; setValue keeps it synced for external updates.
  const getOptions = useEffectEvent(() => options)
  const getValue = useEffectEvent(() => value)

  useLayoutEffect(() => {
    if (!parent) {
      bindingRef.current = null
      return
    }

    // Seed the bound object with the latest value so a recreated binding
    // shows current state, not the initial.
    paramsRef.current[key] = getValue()
    const { label, ...bindingOpts } = getOptions()
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
      if (bindingRef.current === (binding as unknown as { refresh(): void; dispose(): void })) {
        bindingRef.current = null
      }
    }
    // options/value are read via useEffectEvent, so they stay out of the
    // dep list and don't retrigger setup — only parent/key rebind.
  }, [parent, key])

  const setValue = useCallback(
    (v: T) => {
      paramsRef.current[key] = v
      setValueState(v)
      bindingRef.current?.refresh()
    },
    [key]
  )

  return [value, setValue]
}
