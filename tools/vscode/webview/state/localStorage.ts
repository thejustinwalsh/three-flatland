import type { StateStorage } from 'zustand/middleware'

// Cross-session Zustand `persist` storage adapter backed by the
// webview's `localStorage`. Survives panel disposal, panel reopen, and
// VSCode restart — scoped to the extension's webview origin. Use this
// for user prefs (knobs, panel widths) that should persist across
// every invocation of a tool.
//
// For session-only persistence (panel reload but not panel close), use
// `webviewStorage` instead — backed by `acquireVsCodeApi().setState`.

export const localStorageStorage: StateStorage = {
  getItem(name) {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem(name, value) {
    try {
      localStorage.setItem(name, value)
    } catch {
      // Quota exceeded / private browsing / disabled storage — silent.
    }
  },
  removeItem(name) {
    try {
      localStorage.removeItem(name)
    } catch {
      // ignore
    }
  },
}
