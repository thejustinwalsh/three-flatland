import { createContext, useContext } from 'react'

/**
 * State for the compare slider — managed by CanvasStage when
 * compareImageSource is set, consumed by CompareLayer (renders the split)
 * and CompareSliderOverlay (the HTML drag UI).
 *
 * Mirrors the ViewportController pattern: the value is a small object
 * with a getter and a setter, both stable references. Setting splitU
 * triggers re-renders only in subscribers via the context value's
 * identity change.
 */
export type CompareController = {
  splitU: number
  setSplitU: (next: number) => void
  loading: boolean
}

/**
 * React context carrying the active compare controller. CanvasStage's
 * compare-mode wrapping provides this. Children (CompareLayer,
 * CompareSliderOverlay) consume via the hook.
 *
 * Default value is null — components that read this MUST handle null
 * (signaling "not in compare mode").
 */
export const CompareContext = createContext<CompareController | null>(null)

/**
 * Hook to read the current compare controller. Returns null when called
 * outside a compare-mode CanvasStage. Callers should defensively handle
 * the null case to keep components reusable in non-compare contexts.
 */
export function useCompareController(): CompareController | null {
  return useContext(CompareContext)
}
