import { useSyncExternalStore } from 'react'
import { computeMerge, type MergeResult, type MergeSource } from '@three-flatland/io/atlas'
import type { AtlasJson } from '@three-flatland/io/atlas'

// All state the webview needs. Derived merge result is recomputed on
// any change.
export type MergeState = {
  sources: Array<{
    uri: string
    imageUri: string
    alias: string
    json: AtlasJson
    renames: { frames?: Record<string, string>; animations?: Record<string, string> }
  }>
  knobs: { maxSize: number; padding: number; powerOfTwo: boolean }
  outputFileName: string
  // UI state: URIs whose images failed to load. Not factored into derive().
  imageLoadFailed: Set<string>
  // Derived (cached on each setState).
  result: MergeResult
  /** Sizes (from CANDIDATE_SIZES) where the current sources/renames pack OK. */
  viableSizes: number[]
}

const CANDIDATE_SIZES = [256, 512, 1024, 2048, 4096, 8192]

export { CANDIDATE_SIZES }

const listeners = new Set<() => void>()
let state: MergeState = {
  sources: [],
  knobs: { maxSize: 4096, padding: 2, powerOfTwo: false },
  outputFileName: 'merged.png',
  imageLoadFailed: new Set(),
  result: { kind: 'ok', atlas: emptyAtlas(), placements: [], utilization: 0 },
  viableSizes: [],
}

function emptyAtlas(): AtlasJson {
  return {
    meta: { app: 'fl-sprite-atlas', version: '1.0', image: 'merged.png', size: { w: 0, h: 0 }, scale: '1' },
    frames: {},
  }
}

function derive(next: MergeState): MergeState {
  const sources: MergeSource[] = next.sources.map((s) => ({
    uri: s.uri,
    alias: s.alias,
    json: s.json,
    renames: s.renames,
  }))
  const result = computeMerge({ ...next.knobs, sources, outputFileName: next.outputFileName })
  // Probe each candidate size for viability. Cheap (microseconds per pack
  // on typical pixel-art rect counts) and lets the UI offer only sizes
  // that will actually fit.
  const viableSizes: number[] = []
  if (sources.length > 0) {
    for (const size of CANDIDATE_SIZES) {
      const probe = computeMerge({ ...next.knobs, maxSize: size, sources, outputFileName: next.outputFileName })
      if (probe.kind === 'ok') viableSizes.push(size)
    }
  }
  return { ...next, result, viableSizes }
}

export function setMergeState(updater: (s: MergeState) => MergeState): void {
  state = derive(updater(state))
  listeners.forEach((l) => l())
}

export function useMergeState(): MergeState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}

// Convenience setters used by the UI.
export const mergeActions = {
  setSources(sources: MergeState['sources']): void {
    setMergeState((s) => ({ ...s, sources, imageLoadFailed: new Set() }))
  },
  markImageFailed(uri: string): void {
    setMergeState((s) => {
      if (s.imageLoadFailed.has(uri)) return s
      const next = new Set(s.imageLoadFailed)
      next.add(uri)
      return { ...s, imageLoadFailed: next }
    })
  },
  clearImageFailed(uri: string): void {
    setMergeState((s) => {
      if (!s.imageLoadFailed.has(uri)) return s
      const next = new Set(s.imageLoadFailed)
      next.delete(uri)
      return { ...s, imageLoadFailed: next }
    })
  },
  setAlias(uri: string, alias: string): void {
    setMergeState((s) => ({
      ...s,
      sources: s.sources.map((src) => (src.uri === uri ? { ...src, alias } : src)),
    }))
  },
  setFrameRename(uri: string, original: string, merged: string | null): void {
    setMergeState((s) => ({
      ...s,
      sources: s.sources.map((src) => {
        if (src.uri !== uri) return src
        const next = { ...(src.renames.frames ?? {}) }
        if (merged === null) delete next[original]
        else next[original] = merged
        return { ...src, renames: { ...src.renames, frames: next } }
      }),
    }))
  },
  setAnimRename(uri: string, original: string, merged: string | null): void {
    setMergeState((s) => ({
      ...s,
      sources: s.sources.map((src) => {
        if (src.uri !== uri) return src
        const next = { ...(src.renames.animations ?? {}) }
        if (merged === null) delete next[original]
        else next[original] = merged
        return { ...src, renames: { ...src.renames, animations: next } }
      }),
    }))
  },
  setKnobs(knobs: Partial<MergeState['knobs']>): void {
    setMergeState((s) => ({ ...s, knobs: { ...s.knobs, ...knobs } }))
  },
  setOutputFileName(name: string): void {
    setMergeState((s) => ({ ...s, outputFileName: name }))
  },
}
