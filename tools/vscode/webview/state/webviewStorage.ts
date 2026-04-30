import type { StateStorage } from 'zustand/middleware'
import { getVSCodeApi } from '@three-flatland/bridge/client'

// Zustand persist storage adapter backed by VSCode's per-panel
// webview state (acquireVsCodeApi().getState() / setState()). Survives
// panel reload (incl. dev/reload-request) and tab focus changes when
// retainContextWhenHidden is true. Lost when the panel is disposed —
// for cross-session persistence we'd need a host-side WebviewPanelSerializer
// + workspaceState (out of scope for v1).
//
// VSCode webview state is a single value; we partition it by Zustand
// store name into a flat object so multiple stores can coexist.

type VSCodeApiWithState = {
  postMessage: (msg: unknown) => void
  getState: () => unknown
  setState: (state: unknown) => void
}

let cachedRoot: Record<string, string> | null = null

function readRoot(): Record<string, string> {
  if (cachedRoot !== null) return cachedRoot
  try {
    const api = getVSCodeApi() as unknown as VSCodeApiWithState
    const v = api.getState() as Record<string, string> | null | undefined
    cachedRoot = v && typeof v === 'object' ? { ...v } : {}
  } catch {
    cachedRoot = {}
  }
  return cachedRoot
}

function writeRoot(): void {
  if (cachedRoot === null) return
  try {
    const api = getVSCodeApi() as unknown as VSCodeApiWithState
    api.setState(cachedRoot)
  } catch {
    // Outside a webview context (tests, dev) — no-op.
  }
}

export const webviewStorage: StateStorage = {
  getItem(name) {
    const root = readRoot()
    const v = root[name]
    return v === undefined ? null : v
  },
  setItem(name, value) {
    const root = readRoot()
    root[name] = value
    writeRoot()
  },
  removeItem(name) {
    const root = readRoot()
    delete root[name]
    writeRoot()
  },
}
