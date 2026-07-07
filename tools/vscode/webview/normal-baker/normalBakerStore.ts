import { create, useStore } from 'zustand'
import { temporal } from 'zundo'
import type { TemporalState } from 'zundo'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { NormalBump, NormalDirection } from '@three-flatland/normals'
import { localStorageStorage, webviewStorage } from '../state'
import {
  addRegion,
  removeRegions,
  reorderRegion,
  replaceRegion,
  updateRegion,
  type EditableRegion,
} from './regionOps'

/** Descriptor-level defaults — mirrors `NormalSourceDescriptor` minus `version`/`regions`. */
export type NormalBakerDefaults = {
  bump?: NormalBump
  direction?: NormalDirection
  pitch?: number
  strength?: number
  elevation?: number
}

export type NormalBakerStoreState = {
  // Document content — tracked in undo history, persisted across panel reloads.
  regions: EditableRegion[]
  defaults: NormalBakerDefaults

  // Session UI state — persisted via webviewStorage, not undoable.
  selectedIds: Set<string>

  // Cross-session UI pref.
  regionListPx: number

  setRegions: (next: EditableRegion[] | ((prev: EditableRegion[]) => EditableRegion[])) => void
  setDefaults: (
    next: NormalBakerDefaults | ((prev: NormalBakerDefaults) => NormalBakerDefaults)
  ) => void
  setSelectedIds: (next: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  setRegionListPx: (px: number) => void

  addRegionAction: (region: EditableRegion, index?: number) => void
  removeSelected: () => void
  reorderRegionAction: (fromIndex: number, toIndex: number) => void
  updateRegionAction: (id: string, patch: Partial<EditableRegion>) => void
  replaceRegionAction: (next: EditableRegion) => void

  /** Replace regions + defaults from a bridge init payload; clears undo history. */
  loadFromInit: (regions: EditableRegion[], defaults: NormalBakerDefaults) => void
}

type HistorySlice = {
  regions: NormalBakerStoreState['regions']
  defaults: NormalBakerStoreState['defaults']
}

// Content equality (not reference equality) for the undo dedup — every
// setter returns fresh objects/arrays even when content is unchanged
// (e.g. a NumberField blur that didn't actually change the value).
// Regions/defaults are small, flat, JSON-safe objects, so a stringify
// compare is sufficient here — see atlas/merge stores for the
// per-field comparator version this pattern is modeled on.
function regionsEqual(a: EditableRegion[], b: EditableRegion[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false
  }
  return true
}

function defaultsEqual(a: NormalBakerDefaults, b: NormalBakerDefaults): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export const useNormalBakerStore = create<NormalBakerStoreState>()(
  temporal(
    persist(
      persist(
        (set) => ({
          regions: [],
          defaults: {},
          selectedIds: new Set<string>(),
          regionListPx: 260,

          setRegions: (next) =>
            set((s) => ({ ...s, regions: typeof next === 'function' ? next(s.regions) : next })),

          setDefaults: (next) =>
            set((s) => ({ ...s, defaults: typeof next === 'function' ? next(s.defaults) : next })),

          setSelectedIds: (next) =>
            set((s) => ({
              ...s,
              selectedIds: typeof next === 'function' ? next(s.selectedIds) : next,
            })),

          setRegionListPx: (px) => set((s) => ({ ...s, regionListPx: px })),

          addRegionAction: (region, index) =>
            set((s) => ({
              ...s,
              regions: addRegion(s.regions, region, index),
              selectedIds: new Set([region.id]),
            })),

          removeSelected: () =>
            set((s) => ({
              ...s,
              regions: removeRegions(s.regions, s.selectedIds),
              selectedIds: new Set<string>(),
            })),

          reorderRegionAction: (fromIndex, toIndex) =>
            set((s) => ({ ...s, regions: reorderRegion(s.regions, fromIndex, toIndex) })),

          updateRegionAction: (id, patch) =>
            set((s) => ({ ...s, regions: updateRegion(s.regions, id, patch) })),

          replaceRegionAction: (next) =>
            set((s) => ({ ...s, regions: replaceRegion(s.regions, next) })),

          loadFromInit: (regions, defaults) => {
            useNormalBakerStore.setState({ regions, defaults, selectedIds: new Set<string>() })
            useNormalBakerStore.temporal.getState().clear()
          },
        }),
        {
          name: 'fl-normal-baker-session',
          storage: createJSONStorage(() => webviewStorage),
          partialize: (s) => ({
            regions: s.regions,
            defaults: s.defaults,
            selectedIds: Array.from(s.selectedIds),
          }),
          merge: (persisted, current) => {
            const p = persisted as {
              regions?: EditableRegion[]
              defaults?: NormalBakerDefaults
              selectedIds?: string[]
            }
            return {
              ...current,
              ...(p.regions !== undefined ? { regions: p.regions } : {}),
              ...(p.defaults !== undefined ? { defaults: p.defaults } : {}),
              selectedIds: new Set<string>(p.selectedIds ?? []),
            }
          },
        }
      ),
      {
        name: 'fl-normal-baker-prefs',
        storage: createJSONStorage(() => localStorageStorage),
        partialize: (s) => ({ regionListPx: s.regionListPx }),
      }
    ),
    {
      partialize: (s): HistorySlice => ({ regions: s.regions, defaults: s.defaults }),
      limit: 100,
      equality: (a, b) =>
        regionsEqual(a.regions, b.regions) && defaultsEqual(a.defaults, b.defaults),
      handleSet: (handleSet) => {
        let timer: ReturnType<typeof setTimeout> | null = null
        return (pastState) => {
          if (timer !== null) clearTimeout(timer)
          timer = setTimeout(() => {
            handleSet(pastState)
            timer = null
          }, 100)
        }
      },
    }
  )
)

export function useNormalBakerRegions(): EditableRegion[] {
  return useStore(useNormalBakerStore, (s) => s.regions)
}

export function useNormalBakerDefaults(): NormalBakerDefaults {
  return useStore(useNormalBakerStore, (s) => s.defaults)
}

export function useNormalBakerSelectedIds(): Set<string> {
  return useStore(useNormalBakerStore, (s) => s.selectedIds)
}

export const normalBakerActions = {
  setRegions: (next: EditableRegion[] | ((prev: EditableRegion[]) => EditableRegion[])) =>
    useNormalBakerStore.getState().setRegions(next),
  setDefaults: (next: NormalBakerDefaults | ((prev: NormalBakerDefaults) => NormalBakerDefaults)) =>
    useNormalBakerStore.getState().setDefaults(next),
  setSelectedIds: (next: Set<string> | ((prev: Set<string>) => Set<string>)) =>
    useNormalBakerStore.getState().setSelectedIds(next),
  setRegionListPx: (px: number) => useNormalBakerStore.getState().setRegionListPx(px),
  addRegion: (region: EditableRegion, index?: number) =>
    useNormalBakerStore.getState().addRegionAction(region, index),
  removeSelected: () => useNormalBakerStore.getState().removeSelected(),
  reorderRegion: (fromIndex: number, toIndex: number) =>
    useNormalBakerStore.getState().reorderRegionAction(fromIndex, toIndex),
  updateRegion: (id: string, patch: Partial<EditableRegion>) =>
    useNormalBakerStore.getState().updateRegionAction(id, patch),
  replaceRegion: (next: EditableRegion) => useNormalBakerStore.getState().replaceRegionAction(next),
  loadFromInit: (regions: EditableRegion[], defaults: NormalBakerDefaults) =>
    useNormalBakerStore.getState().loadFromInit(regions, defaults),
}

export const normalBakerHistory = {
  undo: () => useNormalBakerStore.temporal.getState().undo(),
  redo: () => useNormalBakerStore.temporal.getState().redo(),
}

export function useNormalBakerHistoryStore(): TemporalState<HistorySlice> {
  return useStore(useNormalBakerStore.temporal)
}
