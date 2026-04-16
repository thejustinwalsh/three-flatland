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
 *
 * Binding is created synchronously during render (same pattern as usePaneFolder)
 * so all controls appear on first render with no pop-in.
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
  const listenerRef = useRef<((ev: { value: unknown }) => void) | null>(null)

  // Track mount lifecycle so the binding's change listener can drop
  // updates that arrive between React's cleanup and our `setTimeout(0)`
  // actually disposing the binding (deferred-disposal pattern). Without
  // this gate, those late events trigger React's "state update on
  // unmounted component" warning.
  const mountedRef = useRef(false)

  // Create binding synchronously on first render so controls appear on
  // first paint with no pop-in. This deliberately accesses/mutates refs
  // during render — incompatible with React Compiler, but the alternative
  // (useEffect-only setup) causes visible flicker in strict mode.
  if (parent && bindingRef.current === null) {
    const { label, ...bindingOpts } = options
    paramsRef.current[key] = initialValue

    const binding = parent.addBinding(paramsRef.current, key, {
      label: label ?? key,
      ...bindingOpts,
    } as Record<string, unknown>)

    const listener = (ev: { value: unknown }) => {
      if (mountedRef.current) setValueState(ev.value as T)
    }
    binding.on('change', listener)
    listenerRef.current = listener
    bindingRef.current = binding as unknown as { refresh(): void; dispose(): void }
  }

  // Deferred disposal — survives React strict mode cleanup/re-mount
  useEffect(() => {
    mountedRef.current = true

    // Strict mode may have disposed the binding — recreate
    if (parent && bindingRef.current === null) {
      const { label, ...bindingOpts } = options
      paramsRef.current[key] = initialValue
      const binding = parent.addBinding(paramsRef.current, key, {
        label: label ?? key,
        ...bindingOpts,
      } as Record<string, unknown>)
      const listener = (ev: { value: unknown }) => {
        if (mountedRef.current) setValueState(ev.value as T)
      }
      binding.on('change', listener)
      listenerRef.current = listener
      bindingRef.current = binding as unknown as { refresh(): void; dispose(): void }
    }

    return () => {
      const binding = bindingRef.current
      setTimeout(() => {
        if (!mountedRef.current && binding) {
          binding.dispose()
          if (bindingRef.current === binding) {
            bindingRef.current = null
            listenerRef.current = null
          }
        }
      }, 0)
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
