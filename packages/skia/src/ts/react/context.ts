import { createContext } from 'react'
import type { SkiaContext } from '../context'

/**
 * React context for the nearest SkiaContext.
 * Provided by `<skiaCanvas>` wrapper or manually via `<SkiaReactContext.Provider>`.
 * Consumed by `useSkiaContext()` as highest-priority source.
 */
export const SkiaReactContext = createContext<SkiaContext | null>(null)
