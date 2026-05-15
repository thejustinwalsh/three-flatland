/**
 * sounds.ts — thin facade over `docs/src/audio/bridge.ts`.
 *
 * This module preserves the public function-based API the rest of the
 * docs site has been calling (`playClick`, `playHover`, `setVolumeLevel`,
 * `setupSoundEvents`, …) while delegating actual playback to the
 * audio-bridge singleton. The synth engine itself is no longer inlined
 * here — `zzfx` from the npm package owns it.
 *
 * Lazy: callers (`playClick()`, etc.) do NOT await the bridge. They
 * fire-and-forget; the first call kicks off the dynamic import. By the
 * time a user has interacted enough to trigger several sounds the
 * bridge is hot and every call is synchronous.
 *
 * History: previously this file was ~804 lines including two duplicate
 * ZzFX synth implementations. The dedup landed in issue #32's audio
 * restore phase; see git history for the migration trail.
 */

import type { PlaySoundFn, ZzFxParams } from '../audio/types'
import { createZzfxProxy } from '../audio/proxy'
import { getBridge, getBridgeSync, hasBridge } from '../audio/bridge'
import {
    loadVolumeLevel,
    saveVolumeLevel,
    hasVolumePreference as hasVolumePreferenceFromStorage,
    type VolumeLevel,
} from '../audio/storage'

export type { VolumeLevel, ZzFxParams as ZzFXParams, PlaySoundFn }

// ────────── Audio-state subscription ──────────

type AudioStateCallback = (initialized: boolean) => void
const audioStateCallbacks = new Set<AudioStateCallback>()

export function onAudioStateChange(cb: AudioStateCallback): () => void {
    audioStateCallbacks.add(cb)
    cb(hasBridge())
    return () => audioStateCallbacks.delete(cb)
}

function notifyAudioReady(): void {
    for (const cb of audioStateCallbacks) cb(true)
}

export function isAudioInitialized(): boolean {
    return hasBridge()
}

// ────────── Volume state (synchronous; bridge stays in sync via setMasterLevel) ──────────

let currentVolumeLevel: VolumeLevel = 0

export function initVolumeLevel(): void {
    currentVolumeLevel = loadVolumeLevel()
}

export function getVolumeLevel(): VolumeLevel {
    return currentVolumeLevel
}

export function isSoundEnabled(): boolean {
    return currentVolumeLevel > 0
}

export function hasVolumePreference(): boolean {
    return hasVolumePreferenceFromStorage()
}

export function setVolumeLevel(level: VolumeLevel): void {
    currentVolumeLevel = level
    // Persist before any bridge construction so a cold-load constructor
    // sees the latest value via loadVolumeLevel(). Then sync the running
    // bridge — either now (hot path) or on resolve (cold path). The
    // cold-path bridge.setMasterLevel call is what triggers the first-
    // unmute music-autostart logic.
    saveVolumeLevel(level)
    const sync = getBridgeSync()
    if (sync) {
        sync.setMasterLevel(level)
    } else if (level > 0) {
        getBridge()
            .then((bridge) => {
                bridge.setMasterLevel(level)
                notifyAudioReady()
            })
            .catch(() => {})
    }
}

export function cycleVolumeLevel(): VolumeLevel {
    const next = ((currentVolumeLevel + 1) % 4) as VolumeLevel
    setVolumeLevel(next)
    return next
}

/** Legacy boolean toggle — preserved for compatibility with older callers. */
export function toggleSound(): boolean {
    if (isSoundEnabled()) {
        setVolumeLevel(0)
        return false
    }
    setVolumeLevel(3)
    playToggleOn()
    return true
}

/** Forces an audio-context creation. Returns the bridge once ready. */
export async function initAudio(): Promise<boolean> {
    try {
        await getBridge()
        notifyAudioReady()
        return true
    } catch {
        return false
    }
}

// ────────── Sound preset playback ──────────

/** Fire-and-forget play. Triggers the lazy import on first call; once the
 * bridge is hot, subsequent calls are synchronous. */
function play(params: ZzFxParams): void {
    if (currentVolumeLevel === 0) return
    const sync = getBridgeSync()
    if (sync) {
        sync.playSfx(params)
        return
    }
    getBridge()
        .then((b) => b.playSfx(params))
        .catch(() => {})
}

/**
 * Compute a normalized volume that compensates for perceptual loudness
 * differences across frequency and waveform shape. Based on a simplified
 * A-weighting curve + waveform energy table. Kept inline so preset
 * definitions can stay declarative below.
 */
function normalizeVolume(base: number, frequency: number, shape = 0): number {
    let freqComp: number
    if (frequency < 200) freqComp = 2.0
    else if (frequency < 500) freqComp = 1.4 + ((500 - frequency) / 500) * 0.6
    else if (frequency < 1000) freqComp = 1.0 + ((1000 - frequency) / 500) * 0.4
    else if (frequency < 2000) freqComp = 1.0
    else if (frequency < 4000) freqComp = 0.9
    else freqComp = 0.8
    const shapeComp: Record<number, number> = { 0: 1.0, 1: 0.65, 2: 0.75, 3: 0.9, 4: 0.7 }
    return base * freqComp * (shapeComp[shape] ?? 1.0)
}

const BASE_VOL = 0.5

export function playClick(): void {
    const freq = 400,
        shape = 3
    play([normalizeVolume(BASE_VOL * 0.7, freq, shape), 0, freq, 0, 0.015, 0.035, shape, 1, 0, 0, 0, 0, 0, 0, 0, 0])
}

export function playButtonPress(): void {
    const freq = 420,
        shape = 1
    play([normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0.01, 0.03, 0.08, shape, 0.3, -20, 0, 0, 0, 0, 0.15, 0, 8])
}

export function playHover(): void {
    const freq = 500 + Math.random() * 100,
        shape = 3
    play([normalizeVolume(BASE_VOL * 0.6, freq, shape), 0.05, freq, 0, 0.015, 0.03, shape, 1, 0, 0, 0, 0, 0, 0, 0, 0])
}

export function playCardHover(): void {
    const freq = 350 + Math.random() * 30,
        shape = 0
    play([normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0, 0.03, 0.06, shape, 1, 0, 0, 80, 0.02, 0, 0, 0, 0])
}

export function playToggleOn(): void {
    const freq = 280,
        shape = 0
    play([normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0, 0.04, 0.08, shape, 1, 0, 0, 180, 0.025, 0, 0, 0, 0])
}

export function playToggleOff(): void {
    const freq = 380,
        shape = 0
    play([normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0, 0.04, 0.08, shape, 1, 0, 0, -120, 0.025, 0, 0, 0, 0])
}

export function playAccordionOpen(): void {
    const freq = 300,
        shape = 0
    play([normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0, 0.03, 0.05, shape, 1, 0, 0, 150, 0.03, 0, 0, 0, 0])
}

export function playAccordionClose(): void {
    const freq = 450,
        shape = 0
    play([normalizeVolume(BASE_VOL, freq, shape), 0, freq, 0, 0.03, 0.05, shape, 1, 0, 0, -150, 0.03, 0, 0, 0, 0])
}

export function playWarp(): void {
    const freq = 220,
        shape = 0
    play([normalizeVolume(BASE_VOL * 0.8, freq, shape), 0, freq, 0.02, 0.08, 0.15, shape, 1, 50, 0, 200, 0.04, 0, 0, 0, 4])
}

// ────────── Global event wiring (data-sound + accordion + first-gesture unlock) ──────────

type SoundType = 'card' | 'button' | 'hover' | 'click' | 'accordion' | 'warp' | 'none'

function findSoundElement(target: HTMLElement): { element: Element; sound: SoundType } | null {
    const soundElement = target.closest('[data-sound]')
    if (soundElement) {
        const sound = soundElement.getAttribute('data-sound') as SoundType
        if (sound === 'none') return null
        return { element: soundElement, sound }
    }
    const button = target.closest('button')
    if (button) return { element: button, sound: 'button' }
    const link = target.closest('a[href]')
    if (link) return { element: link, sound: 'hover' }
    return null
}

const hoveredElements = new WeakSet<Element>()
let soundEventsSetup = false

export function setupSoundEvents(): void {
    if (typeof document === 'undefined') return
    if (soundEventsSetup) return
    soundEventsSetup = true

    // First-gesture unlock — kicks off the lazy bridge import. AudioContext
    // creation needs a user gesture; this is when we get it.
    const initOnInteraction = () => {
        initAudio()
        document.removeEventListener('click', initOnInteraction)
        document.removeEventListener('keydown', initOnInteraction)
    }
    document.addEventListener('click', initOnInteraction, { once: true })
    document.addEventListener('keydown', initOnInteraction, { once: true })

    let lastHoverTime = 0
    const HOVER_DEBOUNCE = 80

    /* Hot-path throttle. `mouseover` fires on every cursor boundary
     * crossing of every element — on pages with deeply-nested DOM
     * (e.g. expressive-code's per-syntax-token spans), this hits
     * thousands of times per second. Each call would otherwise run
     * three `closest()` walks up the tree (`[data-sound]`, `button`,
     * `a[href]`), burning CPU per mousemove with nothing audible to
     * show for it (sound is debounced at 80ms anyway).
     *
     * Gate the handler at ~30ms — that's still well below the 80ms
     * audible debounce, so no sound is ever missed; we just stop
     * walking the DOM 30x for the same audible result. Mouseout uses
     * the same gate so hoveredElements doesn't get partially-stale,
     * and we keep them in lockstep. */
    const HANDLER_THROTTLE_MS = 30
    let lastHandlerTime = 0

    document.addEventListener('mouseover', (e) => {
        const now = Date.now()
        if (now - lastHandlerTime < HANDLER_THROTTLE_MS) return
        lastHandlerTime = now
        const target = e.target as HTMLElement
        if (!target) return
        const result = findSoundElement(target)
        if (!result) return
        const { element, sound } = result
        if (hoveredElements.has(element)) return
        hoveredElements.add(element)
        if (now - lastHoverTime < HOVER_DEBOUNCE) return
        lastHoverTime = now
        if (sound === 'card') playCardHover()
        else if (sound === 'hover' || sound === 'button') playHover()
    })

    document.addEventListener('mouseout', (e) => {
        if (Date.now() - lastHandlerTime < HANDLER_THROTTLE_MS) return
        const target = e.target as HTMLElement
        const relatedTarget = e.relatedTarget as HTMLElement | null
        if (!target) return
        const result = findSoundElement(target)
        if (!result) return
        const { element } = result
        if (relatedTarget && element.contains(relatedTarget)) return
        hoveredElements.delete(element)
    })

    document.addEventListener(
        'click',
        (e) => {
            const target = e.target as HTMLElement
            if (!target) return
            const summary = target.closest('summary')
            if (summary) {
                const details = summary.closest('details')
                if (details) {
                    if (details.open) playAccordionClose()
                    else playAccordionOpen()
                    return
                }
            }
            const result = findSoundElement(target)
            if (!result) return
            const { sound } = result
            if (sound === 'warp') playWarp()
            else if (sound === 'button') playButtonPress()
            else if (sound === 'click' || sound === 'hover' || sound === 'card') playClick()
        },
        true
    )
}

// View-transition support — pre-populate hover-tracking with elements
// already under the cursor after a SPA navigation so we don't immediately
// fire a hover sound on whatever just landed there.
let lastMouseX = 0
let lastMouseY = 0

export function setupViewTransitionSupport(): void {
    if (typeof document === 'undefined') return
    document.addEventListener(
        'mousemove',
        (e) => {
            lastMouseX = e.clientX
            lastMouseY = e.clientY
        },
        { passive: true }
    )
    document.addEventListener('astro:after-swap', () => {
        const elementsUnderCursor = document.elementsFromPoint(lastMouseX, lastMouseY)
        for (const el of elementsUnderCursor) {
            const result = findSoundElement(el as HTMLElement)
            if (result) hoveredElements.add(result.element)
        }
    })
}

// ────────── ZzFX proxy for mini consumers ──────────

export { createZzfxProxy }


/* Accept HMR — keep audio state alive across dev iterations. */
if (import.meta.hot) {
    import.meta.hot.accept()
}
