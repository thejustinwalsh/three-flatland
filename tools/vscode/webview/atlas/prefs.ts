import { useSyncExternalStore } from 'react'

/**
 * User-facing display preferences for the Atlas tool. Persisted in
 * localStorage so the user's choices stick across sessions / restarts.
 *
 * Adding a new preference: extend `AtlasPrefs`, add a default to
 * `DEFAULTS`, bump `STORAGE_KEY` if the change is breaking (it's
 * loaded as a strict shape merge so additive changes are safe and
 * don't need a bump).
 */
export type AtlasPrefs = {
  /** Color readout format in the cursor InfoPanel. */
  colorMode: 'hex' | 'rgba' | 'float'
  /** Coordinate readout format in the cursor InfoPanel. */
  coordMode: 'px' | 'uv+' | 'uv-'
  /** Canvas background — checker (transparency-aware) or solid theme bg. */
  background: 'checker' | 'theme'
  /** Dim region outside the image bounds (helps see the image's edges). */
  dimOutOfBounds: boolean
  /** Render the persistent corner index on each rect. */
  showFrameNumbers: boolean
  /** Render the floating frame name + index chip on hover. */
  showHoverChip: boolean
  /** Render the cursor info bar in the bottom-right of the canvas. */
  showInfoPanel: boolean
  /**
   * Snap wheel zoom to nearest pixel-perfect ratio (image-px to
   * screen-px integer / unit-fraction). Off by default since smooth
   * zoom is the more flexible default.
   */
  pixelSnapZoom: boolean
  /**
   * Whether the animation drawer (inside the Atlas pane) is expanded.
   * Persisted across sessions. The drawer mount auto-promotes this to
   * true the first time a sidecar with non-empty `meta.animations`
   * loads (see `tools/vscode/webview/atlas/App.tsx`).
   */
  animDrawerExpanded: boolean
  /** Drawer body height in pixels when expanded. Persisted across sessions. */
  animDrawerHeight: number
  /** Last corner the floating preview PIP was parked in. */
  animPipCorner: 'tl' | 'tr' | 'br' | 'bl'
  /** Whether the floating preview PIP is shown at all. */
  animPipVisible: boolean
  /**
   * Pixel-art filtering for sprite rendering — nearest-neighbour
   * scaling in both the main canvas (three.js texture filter) and the
   * floating PIP preview (CSS `image-rendering: pixelated`). Off →
   * smooth bilinear filtering. On by default since the tool's primary
   * use case is hand-drawn pixel-art atlases where blur is wrong.
   */
  pixelArt: boolean
}

const DEFAULTS: AtlasPrefs = {
  colorMode: 'hex',
  coordMode: 'px',
  background: 'checker',
  dimOutOfBounds: true,
  showFrameNumbers: true,
  showHoverChip: true,
  showInfoPanel: true,
  pixelSnapZoom: false,
  animDrawerExpanded: false,
  animDrawerHeight: 140,
  animPipCorner: 'tr',
  animPipVisible: true,
  pixelArt: true,
}

const STORAGE_KEY = 'fl-atlas-prefs:v1'

function loadPrefs(): AtlasPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<AtlasPrefs>
    // Merge over defaults so new prefs added in a later release pick up
    // their defaults rather than `undefined`.
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

function savePrefs(prefs: AtlasPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore: quota / private browsing / disabled storage
  }
}

const listeners = new Set<() => void>()
let snapshot: AtlasPrefs = loadPrefs()

export const prefsStore = {
  get: (): AtlasPrefs => snapshot,
  set: (patch: Partial<AtlasPrefs>): void => {
    const next = { ...snapshot, ...patch }
    if (Object.keys(patch).every((k) => snapshot[k as keyof AtlasPrefs] === next[k as keyof AtlasPrefs])) {
      return
    }
    snapshot = next
    savePrefs(snapshot)
    for (const l of listeners) l()
  },
  subscribe: (fn: () => void): (() => void) => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  reset: (): void => {
    snapshot = { ...DEFAULTS }
    savePrefs(snapshot)
    for (const l of listeners) l()
  },
}

export function usePrefs(): AtlasPrefs {
  return useSyncExternalStore(prefsStore.subscribe, prefsStore.get, prefsStore.get)
}
