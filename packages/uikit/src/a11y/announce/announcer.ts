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
let triedDefault = false

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
 * Speak a message through every registered backend. In a DOM env the default off-screen live
 * region auto-registers on first use (unless the app registered its own backend first); SSR /
 * no-DOM is a silent no-op.
 */
export function announce(message: string, opts?: Partial<Omit<Announcement, 'message'>>): void {
  if (!triedDefault && backends.size === 0 && typeof document !== 'undefined') {
    triedDefault = true
    registerAnnouncementBackend(createDomLiveRegionBackend())
  }
  if (backends.size === 0) {
    return
  }
  const announcement: Announcement = {
    message,
    politeness: opts?.politeness ?? 'polite',
    source: opts?.source,
    kind: opts?.kind,
  }
  for (const backend of backends) {
    backend.announce(announcement)
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
