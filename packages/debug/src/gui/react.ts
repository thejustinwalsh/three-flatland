import { useEffect, useEffectEvent } from 'react'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { ControlSchema, GuiPanel, InferState, ValueKeys, ButtonKeys } from './types.js'

export { createGui } from './panel.js'

/**
 * React hook to select values from a GuiPanel store.
 *
 * @example Single key — returns value directly
 * ```ts
 * const mapSize = useGuiStore(gui, 'mapSize') // number
 * ```
 *
 * @example Tuple of keys — returns Pick<State, K>, shallow comparison
 * ```ts
 * const { mapSize, chunkSize } = useGuiStore(gui, ['mapSize', 'chunkSize'])
 * ```
 *
 * @example Selector function — shallow comparison
 * ```ts
 * const derived = useGuiStore(gui, (s) => ({ size: s.mapSize }))
 * ```
 */
export function useGuiStore<S extends ControlSchema, K extends ValueKeys<S>>(
  panel: GuiPanel<S>,
  key: K,
): InferState<S>[K]
export function useGuiStore<S extends ControlSchema, K extends ValueKeys<S>>(
  panel: GuiPanel<S>,
  keys: K[],
): Pick<InferState<S>, K>
export function useGuiStore<S extends ControlSchema, U>(
  panel: GuiPanel<S>,
  selector: (state: InferState<S>) => U,
): U
// Implementation: the overload signatures above narrow the input types at call sites.
// The implementation signature widens to the union, requiring casts when indexing
// the state object with runtime string keys. This is the standard TS overload pattern.
export function useGuiStore<S extends ControlSchema>(
  panel: GuiPanel<S>,
  keyOrSelector: string | string[] | ((state: InferState<S>) => unknown),
): unknown {
  type State = InferState<S>

  const rawSelector =
    typeof keyOrSelector === 'string'
      ? (s: State) => s[keyOrSelector as keyof State]
      : Array.isArray(keyOrSelector)
        ? (s: State) =>
            Object.fromEntries(
              keyOrSelector.map((k) => [k, s[k as keyof State]]),
            )
        : keyOrSelector

  return useStore(panel.store, useShallow(rawSelector))
}

/**
 * React hook to subscribe to button clicks from a GuiPanel.
 *
 * @example
 * ```ts
 * useGuiCallback(gui, 'regenerate', () => {
 *   regenerateMap()
 * })
 * ```
 */
export function useGuiCallback<S extends ControlSchema, K extends ButtonKeys<S>>(
  panel: GuiPanel<S>,
  key: K,
  callback: () => void,
): void {
  const callbackEvent = useEffectEvent(callback);
  useEffect(() => {
    return panel.on(key, () => callbackEvent())
  }, [panel, key])
}
