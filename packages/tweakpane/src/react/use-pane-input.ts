import { useCallback, useEffect, useRef, useState } from 'react'
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
 * Returns [value, setValue] — setValue updates both React state and the TP binding.
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

  useEffect(() => {
    if (!parent) return

    const { label, ...bindingOpts } = options
    paramsRef.current[key] = initialValue

    const binding = parent.addBinding(paramsRef.current, key, {
      label: label ?? key,
      ...bindingOpts,
    } as Record<string, unknown>)

    binding.on('change', (ev: { value: unknown }) => {
      setValueState(ev.value as T)
    })

    bindingRef.current = binding as unknown as { refresh(): void; dispose(): void }

    return () => {
      binding.dispose()
      bindingRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent])

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
