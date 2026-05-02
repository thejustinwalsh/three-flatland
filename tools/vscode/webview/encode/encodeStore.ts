import { create, useStore } from 'zustand'
import { temporal } from 'zundo'
import type { TemporalState } from 'zundo'
import { createJSONStorage, persist } from 'zustand/middleware'
import { localStorageStorage, webviewStorage } from '../state'

// ─── Slice types ─────────────────────────────────────────────────────────────

interface DocSlice {
  format: 'webp' | 'avif' | 'ktx2'
  webp: { quality: number }
  avif: { quality: number }
  ktx2: { mode: 'etc1s' | 'uastc'; quality: number; mipmaps: boolean; uastcLevel: 0 | 1 | 2 | 3 | 4 }
}

interface SessionSlice {
  // fileName survives session reloads; sourceBytes are NOT persisted (cost +
  // serialize) — the host re-emits them via loadInit on every panel open.
  fileName: string
  // sourceBytes is runtime-only even though it logically belongs to the
  // session; storing it in the RuntimeSlice keeps JSON persistence clean.
  // mipLevel: which mip to inspect; persisted per-session so reopening the
  // panel for the same file returns to the inspected mip.
  mipLevel: number
}

interface PrefsSlice {
  // Slider position is a per-machine preference — saved cross-session.
  compareSplitU: number
}

interface RuntimeSlice {
  sourceBytes: Uint8Array | null
  sourceImage: ImageData | null
  encodedBytes: Uint8Array | null
  encodedImage: ImageData | null  // null when format=ktx2 (no decode support)
  encodedSize: number
  isEncoding: boolean
  encodeError: string | null
  encodeReqId: number
  // Derived from the loaded CompressedTexture's mipmap chain; used by T11's
  // mip-stepper for upper-bound clamping.
  encodedMipCount: number
}

// ─── Full store state ─────────────────────────────────────────────────────────

export type EncodeStoreState = DocSlice &
  SessionSlice &
  PrefsSlice &
  RuntimeSlice & {
    // Actions — doc
    setFormat: (format: DocSlice['format']) => void
    setWebpQuality: (quality: number) => void
    setAvifQuality: (quality: number) => void
    setKtx2Mode: (mode: DocSlice['ktx2']['mode']) => void
    setKtx2Quality: (quality: number) => void
    setKtx2Mipmaps: (mipmaps: boolean) => void
    setKtx2UastcLevel: (level: DocSlice['ktx2']['uastcLevel']) => void
    // Actions — prefs
    setCompareSplitU: (u: number) => void
    // Actions — session
    setMipLevel: (n: number) => void
    // Actions — runtime
    setEncodedMipCount: (count: number) => void
    // Actions — lifecycle
    loadInit: (p: { fileName: string; sourceBytes: Uint8Array; sourceImage: ImageData | null }) => void
    // Actions — runtime
    setRuntimeFields: (p: Partial<RuntimeSlice>) => void
    bumpEncodeReqId: () => number
  }

// ─── Content-equality helpers ─────────────────────────────────────────────────

// Shallow content equality for the partialized doc state. Reference checks
// alone fire history entries on every action because setters return fresh
// objects even when nothing changed. Compare values field-by-field.
function docEqual(a: DocSlice, b: DocSlice): boolean {
  return (
    a.format === b.format &&
    a.webp.quality === b.webp.quality &&
    a.avif.quality === b.avif.quality &&
    a.ktx2.mode === b.ktx2.mode &&
    a.ktx2.quality === b.ktx2.quality &&
    a.ktx2.mipmaps === b.ktx2.mipmaps &&
    a.ktx2.uastcLevel === b.ktx2.uastcLevel
  )
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useEncodeStore = create<EncodeStoreState>()(
  temporal(
    // Outer persist: localStorage — cross-session user prefs
    persist(
      // Inner persist: webviewStorage — session state (survives tab focus loss)
      persist(
        (set, get) => ({
          // Doc slice defaults
          format: 'webp' as const,
          webp: { quality: 80 },
          avif: { quality: 60 },
          ktx2: { mode: 'etc1s' as const, quality: 128, mipmaps: true, uastcLevel: 2 as const },

          // Prefs slice defaults
          compareSplitU: 0.5,

          // Session slice defaults
          fileName: 'image',
          mipLevel: 0,

          // Runtime slice defaults — never persisted
          sourceBytes: null,
          sourceImage: null,
          encodedBytes: null,
          encodedImage: null,
          encodedSize: 0,
          isEncoding: false,
          encodeError: null,
          encodeReqId: 0,
          encodedMipCount: 1,

          // Doc actions
          setFormat: (format) => set((s) => ({ ...s, format })),
          setWebpQuality: (quality) => set((s) => ({ ...s, webp: { ...s.webp, quality } })),
          setAvifQuality: (quality) => set((s) => ({ ...s, avif: { ...s.avif, quality } })),
          setKtx2Mode: (mode) => set((s) => ({ ...s, ktx2: { ...s.ktx2, mode } })),
          setKtx2Quality: (quality) => set((s) => ({ ...s, ktx2: { ...s.ktx2, quality } })),
          setKtx2Mipmaps: (mipmaps) => set((s) => ({ ...s, ktx2: { ...s.ktx2, mipmaps } })),
          setKtx2UastcLevel: (uastcLevel) => set((s) => ({ ...s, ktx2: { ...s.ktx2, uastcLevel } })),

          // Prefs actions
          setCompareSplitU: (u) => set((s) => ({ ...s, compareSplitU: Math.min(1, Math.max(0, u)) })),

          // Session actions
          setMipLevel: (n) =>
            set((s) => ({ ...s, mipLevel: Math.min(Math.max(0, s.encodedMipCount - 1), Math.max(0, n)) })),

          // Runtime actions
          setEncodedMipCount: (count) =>
            set((s) => ({ ...s, encodedMipCount: count, mipLevel: 0 })),

          // Lifecycle action — bridge `encode/init` calls this. Sets state and
          // clears undo history so the user's stack starts empty on each load.
          loadInit: ({ fileName, sourceBytes, sourceImage }) => {
            set((s) => ({
              ...s,
              fileName,
              sourceBytes,
              sourceImage,
              // Reset encoded output whenever a new source arrives.
              encodedBytes: null,
              encodedImage: null,
              encodedSize: 0,
              isEncoding: false,
              encodeError: null,
            }))
            useEncodeStore.temporal.getState().clear()
          },

          // Runtime action — encode pipeline calls this to drop results.
          setRuntimeFields: (p) => set((s) => ({ ...s, ...p })),

          // Race-id: increment + return new id so caller can detect stale
          // responses (older encode jobs that arrive after a newer one started).
          bumpEncodeReqId: () => {
            const next = get().encodeReqId + 1
            set((s) => ({ ...s, encodeReqId: next }))
            return next
          },
        }),
        {
          // Session state: survives tab focus loss + dev reload, lost on panel close.
          name: 'fl-encode-session',
          storage: createJSONStorage(() => webviewStorage),
          partialize: (s) => ({
            format: s.format,
            webp: s.webp,
            avif: s.avif,
            ktx2: s.ktx2,
            fileName: s.fileName,
            mipLevel: s.mipLevel,
          }),
        },
      ),
      {
        // Cross-session prefs: survive panel close + VSCode restart.
        name: 'fl-encode-prefs',
        storage: createJSONStorage(() => localStorageStorage),
        partialize: (s) => ({ compareSplitU: s.compareSplitU }),
      },
    ),
    {
      // Track only doc fields in undo history. UI / runtime fields are not
      // undoable. On undo, setState fires from inside zundo and our actions
      // don't run — no re-derive needed here (no computed fields in DocSlice).
      partialize: (s): DocSlice => ({
        format: s.format,
        webp: s.webp,
        avif: s.avif,
        ktx2: s.ktx2,
      }),
      limit: 50,
      // Shallow content equality on the partialized state. Reference equality
      // alone produces spurious history entries because every setter returns
      // fresh objects even when content is identical (e.g. clicking the
      // dropdown's already-selected value, blurring a number field unchanged).
      equality: (a, b) => docEqual(a, b),
      // Coalesce bursts of rapid set calls (NumberField drag, hot-key repeats)
      // into a single undo entry. Trailing-edge debounce: the history entry is
      // recorded 100 ms after the last change in the burst, capturing the prior
      // state so one undo rewinds the whole burst. 100 ms is below
      // human-perceptible undo latency.
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
    },
  ),
)

// Convenience hook matching peer-store API.
export function useEncodeState(): EncodeStoreState {
  return useStore(useEncodeStore)
}

// Convenience action namespace for callers that don't subscribe to the store.
export const encodeActions = {
  setFormat: (format: DocSlice['format']) =>
    useEncodeStore.getState().setFormat(format),
  setWebpQuality: (quality: number) =>
    useEncodeStore.getState().setWebpQuality(quality),
  setAvifQuality: (quality: number) =>
    useEncodeStore.getState().setAvifQuality(quality),
  setKtx2Mode: (mode: DocSlice['ktx2']['mode']) =>
    useEncodeStore.getState().setKtx2Mode(mode),
  setKtx2Quality: (quality: number) =>
    useEncodeStore.getState().setKtx2Quality(quality),
  setKtx2Mipmaps: (mipmaps: boolean) =>
    useEncodeStore.getState().setKtx2Mipmaps(mipmaps),
  setKtx2UastcLevel: (level: DocSlice['ktx2']['uastcLevel']) =>
    useEncodeStore.getState().setKtx2UastcLevel(level),
  setCompareSplitU: (u: number) =>
    useEncodeStore.getState().setCompareSplitU(u),
  setMipLevel: (n: number) =>
    useEncodeStore.getState().setMipLevel(n),
  setEncodedMipCount: (count: number) =>
    useEncodeStore.getState().setEncodedMipCount(count),
  // Bridge `encode/init` should call this — sets source + fileName AND clears
  // any history accumulated from rehydration / earlier inits. The user's undo
  // stack starts empty when they first see the panel content.
  loadInit: (p: { fileName: string; sourceBytes: Uint8Array; sourceImage: ImageData | null }) =>
    useEncodeStore.getState().loadInit(p),
  setRuntimeFields: (p: Partial<RuntimeSlice>) =>
    useEncodeStore.getState().setRuntimeFields(p),
  bumpEncodeReqId: () =>
    useEncodeStore.getState().bumpEncodeReqId(),
}

// Undo/redo helpers exposed for keyboard handling and UI.
export const encodeHistory = {
  undo: () => useEncodeStore.temporal.getState().undo(),
  redo: () => useEncodeStore.temporal.getState().redo(),
  canUndo: () => useEncodeStore.temporal.getState().pastStates.length > 0,
  canRedo: () => useEncodeStore.temporal.getState().futureStates.length > 0,
}

// Re-export the temporal store so UI can subscribe to canUndo/canRedo.
export function useEncodeHistoryStore(): TemporalState<DocSlice> {
  return useStore(useEncodeStore.temporal)
}
