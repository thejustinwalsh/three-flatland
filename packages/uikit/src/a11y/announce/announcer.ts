import { signal, type ReadonlySignal } from '@preact/signals-core'
import type { Component } from '../../components/component.js'
import { createDomLiveRegionBackend } from './backends/dom-live-region.js'

export type Politeness = 'polite' | 'assertive'

export type Announcement = {
  message: string
  politeness: Politeness
  /** The component the message is about — lets spatial backends pan audio / anchor captions. */
  source?: Component
  kind?: 'activation' | 'focus' | 'status'
}

/**
 * A destination for a11y announcements. The default is a DOM `aria-live` region; XR/game modes
 * add in-world captions, spatial earcons, controller haptics, or speech synthesis — one live
 * region is a browser-mode backend, not the whole system (adversarial finding #9).
 */
export interface AnnouncementBackend {
  announce(a: Announcement): void
  dispose?(): void
}

const backends = new Set<AnnouncementBackend>()
let defaultDomBackend: AnnouncementBackend | undefined
let defaultDomBackendTried = false
let defaultDomBackendEnabled = true

/** Register an announcement backend; returns an unregister function that disposes it. */
export function registerAnnouncementBackend(backend: AnnouncementBackend): () => void {
  backends.add(backend)
  return () => {
    if (backends.delete(backend)) {
      backend.dispose?.()
    }
  }
}

/**
 * Ensure the built-in DOM `aria-live` backend exists — once, in a DOM env, unless explicitly
 * disabled. It is ADDITIVE with any app backends: registering captions/earcons/haptics must NEVER
 * suppress screen-reader announcements, which the old "auto-register only when backends is empty"
 * rule silently did (codex system #4).
 */
function ensureDefaultDomBackend(): void {
  if (defaultDomBackendTried || !defaultDomBackendEnabled || typeof document === 'undefined') {
    return
  }
  defaultDomBackendTried = true
  defaultDomBackend = createDomLiveRegionBackend()
  backends.add(defaultDomBackend)
}

/**
 * Enable/disable the built-in DOM live-region (screen-reader) backend explicitly. On by default in a
 * DOM environment; disable it ONLY when the app deliberately routes every announcement through its
 * own backends. Replacement is now an explicit choice, not inferred from whether other backends exist.
 */
export function setDefaultAnnouncementBackend(enabled: boolean): void {
  defaultDomBackendEnabled = enabled
  if (!enabled) {
    if (defaultDomBackend != null && backends.delete(defaultDomBackend)) {
      defaultDomBackend.dispose?.()
    }
    defaultDomBackend = undefined
  } else if (defaultDomBackend == null) {
    defaultDomBackendTried = false
    ensureDefaultDomBackend()
  }
}

/**
 * Speak a message through every registered backend. The built-in DOM live region is ensured first (in
 * a DOM env, unless disabled); SSR / no-DOM with no custom backend is a silent no-op.
 */
export function announce(message: string, opts?: Partial<Omit<Announcement, 'message'>>): void {
  ensureDefaultDomBackend()
  if (backends.size === 0) {
    return
  }
  const announcement: Announcement = {
    message,
    politeness: opts?.politeness ?? 'polite',
    source: opts?.source,
    kind: opts?.kind,
  }
  // Snapshot the set (a backend may register/unregister during delivery) and isolate per-backend
  // errors, so one throwing backend cannot abort delivery to the others or propagate out of the
  // focus/activation caller (codex system #9).
  for (const backend of [...backends]) {
    try {
      backend.announce(announcement)
    } catch {
      // A backend's own failure must not break a11y delivery.
    }
  }
}

/** User a11y preferences read by backends + the focus-reveal policy. */
export type A11yPreferences = {
  captions: boolean
  earcons: boolean
  haptics: boolean
  speech: boolean
  monoAudio: boolean
  reducedMotion: boolean
}

const preferences = /* @__PURE__ */ signal<A11yPreferences>({
  captions: false,
  earcons: false,
  haptics: false,
  speech: false,
  monoAudio: false,
  reducedMotion: false,
})

export function setA11yPreferences(prefs: Partial<A11yPreferences>): void {
  preferences.value = { ...preferences.value, ...prefs }
}

export function getA11yPreferences(): ReadonlySignal<A11yPreferences> {
  return preferences
}
