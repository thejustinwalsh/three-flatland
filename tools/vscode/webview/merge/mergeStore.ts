import { create, useStore } from 'zustand'
import { temporal } from 'zundo'
import type { TemporalState } from 'zundo'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  computeMerge,
  type MergeResult,
  type MergeSource,
} from '@three-flatland/io/atlas'
import type { AtlasJson } from '@three-flatland/io/atlas'
import { webviewStorage } from '../state'

// Candidate output sizes the dropdown can offer. Probed for viability
// on every state change so the UI hides sizes that won't fit.
export const CANDIDATE_SIZES = [256, 512, 1024, 2048, 4096, 8192] as const

export type MergeStoreState = {
  // Primary (user-edited) state. These fields are tracked in undo
  // history and persisted across panel reloads.
  sources: Array<{
    uri: string
    imageUri: string
    alias: string
    json: AtlasJson
    renames: { frames?: Record<string, string>; animations?: Record<string, string> }
  }>
  knobs: { maxSize: number; padding: number; powerOfTwo: boolean }
  outputFileName: string
  deleteOriginals: boolean

  // Derived state — recomputed inside actions. Tracked in undo history
  // so undoing a primary-state change also rewinds the derived view.
  result: MergeResult
  viableSizes: number[]

  // Transient UI flags — NOT in undo history, NOT persisted.
  imageLoadFailed: Set<string>

  // Actions
  setSources: (sources: MergeStoreState['sources']) => void
  setAlias: (uri: string, alias: string) => void
  setFrameRename: (uri: string, original: string, merged: string | null) => void
  setAnimRename: (uri: string, original: string, merged: string | null) => void
  setKnobs: (knobs: Partial<MergeStoreState['knobs']>) => void
  setOutputFileName: (name: string) => void
  setDeleteOriginals: (next: boolean) => void
  markImageFailed: (uri: string) => void
  clearImageFailed: (uri: string) => void
}

// Backwards-compat alias for call sites that import MergeState.
export type MergeState = MergeStoreState

function emptyAtlas(): AtlasJson {
  return {
    meta: {
      app: 'fl-sprite-atlas',
      version: '1.0',
      image: 'merged.png',
      size: { w: 0, h: 0 },
      scale: '1',
    },
    frames: {},
  }
}

// Recompute derived state from current primary state. Called inside
// every action that touches primary state.
function deriveOver<
  T extends Pick<MergeStoreState, 'sources' | 'knobs' | 'outputFileName'>,
>(next: T): { result: MergeResult; viableSizes: number[] } {
  const sources: MergeSource[] = next.sources.map((s) => ({
    uri: s.uri,
    alias: s.alias,
    json: s.json,
    renames: s.renames,
  }))
  const result = computeMerge({
    ...next.knobs,
    sources,
    outputFileName: next.outputFileName,
  })
  const viableSizes: number[] = []
  if (sources.length > 0) {
    for (const size of CANDIDATE_SIZES) {
      const probe = computeMerge({
        ...next.knobs,
        maxSize: size,
        sources,
        outputFileName: next.outputFileName,
      })
      if (probe.kind === 'ok') viableSizes.push(size)
    }
  }
  return { result, viableSizes }
}

type PrimaryState = Pick<
  MergeStoreState,
  'sources' | 'knobs' | 'outputFileName'
>

export const useMergeStore = create<MergeStoreState>()(
  temporal(
    persist(
      (set) => {
        // Helper: apply a primary-state update + re-derive in one go.
        const update = (
          partial: Partial<
            Pick<
              MergeStoreState,
              | 'sources'
              | 'knobs'
              | 'outputFileName'
              | 'deleteOriginals'
              | 'imageLoadFailed'
            >
          >,
        ) => {
          set((s) => {
            const merged = { ...s, ...partial }
            const needsDerive =
              partial.sources !== undefined ||
              partial.knobs !== undefined ||
              partial.outputFileName !== undefined
            const derived = needsDerive
              ? deriveOver(merged)
              : { result: s.result, viableSizes: s.viableSizes }
            return { ...merged, ...derived }
          })
        }

        return {
          sources: [],
          knobs: { maxSize: 4096, padding: 2, powerOfTwo: false },
          outputFileName: 'merged.png',
          deleteOriginals: false,
          result: { kind: 'ok', atlas: emptyAtlas(), placements: [], utilization: 0 },
          viableSizes: [],
          imageLoadFailed: new Set<string>(),

          setSources: (sources) =>
            update({ sources, imageLoadFailed: new Set<string>() }),
          setAlias: (uri, alias) =>
            set((s) => {
              const sources = s.sources.map((src) =>
                src.uri === uri ? { ...src, alias } : src,
              )
              const derived = deriveOver({ ...s, sources })
              return { ...s, sources, ...derived }
            }),
          setFrameRename: (uri, original, merged) =>
            set((s) => {
              const sources = s.sources.map((src) => {
                if (src.uri !== uri) return src
                const next = { ...(src.renames.frames ?? {}) }
                if (merged === null) delete next[original]
                else next[original] = merged
                return { ...src, renames: { ...src.renames, frames: next } }
              })
              const derived = deriveOver({ ...s, sources })
              return { ...s, sources, ...derived }
            }),
          setAnimRename: (uri, original, merged) =>
            set((s) => {
              const sources = s.sources.map((src) => {
                if (src.uri !== uri) return src
                const next = { ...(src.renames.animations ?? {}) }
                if (merged === null) delete next[original]
                else next[original] = merged
                return { ...src, renames: { ...src.renames, animations: next } }
              })
              const derived = deriveOver({ ...s, sources })
              return { ...s, sources, ...derived }
            }),
          setKnobs: (knobs) =>
            set((s) => {
              const nextKnobs = { ...s.knobs, ...knobs }
              const derived = deriveOver({ ...s, knobs: nextKnobs })
              return { ...s, knobs: nextKnobs, ...derived }
            }),
          setOutputFileName: (name) => update({ outputFileName: name }),
          setDeleteOriginals: (next) => update({ deleteOriginals: next }),
          markImageFailed: (uri) =>
            set((s) => {
              if (s.imageLoadFailed.has(uri)) return s
              const next = new Set(s.imageLoadFailed)
              next.add(uri)
              return { ...s, imageLoadFailed: next }
            }),
          clearImageFailed: (uri) =>
            set((s) => {
              if (!s.imageLoadFailed.has(uri)) return s
              const next = new Set(s.imageLoadFailed)
              next.delete(uri)
              return { ...s, imageLoadFailed: next }
            }),
        }
      },
      {
        name: 'fl-merge-store',
        storage: createJSONStorage(() => webviewStorage),
        // Only persist primary user-edited state. Derived state is
        // recomputed on rehydrate; transient state is never persisted.
        partialize: (s) => ({
          sources: s.sources,
          knobs: s.knobs,
          outputFileName: s.outputFileName,
          deleteOriginals: s.deleteOriginals,
        }),
        // After rehydration, recompute derived state once.
        onRehydrateStorage: () => (state) => {
          if (!state) return
          const derived = deriveOver(state)
          state.result = derived.result
          state.viableSizes = derived.viableSizes
        },
      },
    ),
    {
      // Track only primary user-edited fields in undo history. On undo,
      // setState fires from inside zundo and our actions don't run, so
      // we re-derive in a subscriber below.
      partialize: (s): PrimaryState => ({
        sources: s.sources,
        knobs: s.knobs,
        outputFileName: s.outputFileName,
      }),
      limit: 50,
      // Don't push history when only derived/transient fields change.
      equality: (a, b) =>
        a.sources === b.sources &&
        a.knobs === b.knobs &&
        a.outputFileName === b.outputFileName,
    },
  ),
)

// After zundo's undo/redo flips primary state, recompute derived.
useMergeStore.subscribe((state, prev) => {
  if (
    state.sources === prev.sources &&
    state.knobs === prev.knobs &&
    state.outputFileName === prev.outputFileName
  ) {
    return
  }
  const derived = deriveOver(state)
  useMergeStore.setState({ result: derived.result, viableSizes: derived.viableSizes })
})

// Convenience hook matching the previous API.
export function useMergeState(): MergeStoreState {
  return useStore(useMergeStore)
}

// Convenience action namespace matching the previous API.
export const mergeActions = {
  setSources: (sources: MergeStoreState['sources']) =>
    useMergeStore.getState().setSources(sources),
  setAlias: (uri: string, alias: string) =>
    useMergeStore.getState().setAlias(uri, alias),
  setFrameRename: (uri: string, original: string, merged: string | null) =>
    useMergeStore.getState().setFrameRename(uri, original, merged),
  setAnimRename: (uri: string, original: string, merged: string | null) =>
    useMergeStore.getState().setAnimRename(uri, original, merged),
  setKnobs: (knobs: Partial<MergeStoreState['knobs']>) =>
    useMergeStore.getState().setKnobs(knobs),
  setOutputFileName: (name: string) =>
    useMergeStore.getState().setOutputFileName(name),
  setDeleteOriginals: (next: boolean) =>
    useMergeStore.getState().setDeleteOriginals(next),
  markImageFailed: (uri: string) =>
    useMergeStore.getState().markImageFailed(uri),
  clearImageFailed: (uri: string) =>
    useMergeStore.getState().clearImageFailed(uri),
}

// Undo/redo helpers exposed for keyboard handling and UI.
export const mergeHistory = {
  undo: () => useMergeStore.temporal.getState().undo(),
  redo: () => useMergeStore.temporal.getState().redo(),
  canUndo: () => useMergeStore.temporal.getState().pastStates.length > 0,
  canRedo: () => useMergeStore.temporal.getState().futureStates.length > 0,
}

// Re-export the temporal store so UI can subscribe to canUndo/canRedo.
export function useMergeHistoryStore(): TemporalState<PrimaryState> {
  return useStore(useMergeStore.temporal)
}
