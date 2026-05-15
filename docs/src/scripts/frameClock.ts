/**
 * frameClock — a window-attached singleton requestAnimationFrame
 * scheduler. One rAF chain shared across every per-frame consumer on
 * the docs page (motion.ts CSS-var driver, MusicPlayer FFT/progress
 * loop, future ones).
 *
 * Why a singleton on `window`:
 *   - Astro's client router preserves the window across navigations.
 *     If frameClock lived only as a module-level export, every page
 *     transition would import a fresh module instance and the OLD
 *     module's rAF chain (with its subscribers' callbacks) would
 *     keep running against a now-stale closure. By stashing on
 *     `window.__flatlandFrameClock` we get the same survival model
 *     the audio bridge already uses (`window.__threeFlatlandAudio`).
 *   - HMR re-evaluations during dev would otherwise spawn duplicate
 *     clocks. The window guard makes the second `getFrameClock()`
 *     return the FIRST module's clock instance — subscribers from
 *     either module instance share one rAF.
 *
 * Lifecycle rules (the user asked for explicitly):
 *   - subs.size === 0  → no rAF firing, period.
 *   - subs.size  >= 1  → rAF chain runs at 60 Hz, calling every
 *                        subscriber in registration order.
 *   - When the LAST subscriber unsubscribes, the in-flight rAF
 *     finishes its current tick, sees `subs.size === 0`, and does
 *     NOT schedule the next one. No leak, no zombie rAF.
 *
 * Failure containment: a subscriber throwing inside its callback
 * does not break sibling subscribers — each callback is wrapped in
 * try/catch and errors are logged. The clock keeps running.
 */

export interface FrameClock {
    /**
     * Register a per-frame callback. Returns an unsubscribe function.
     * Idempotent for the same callback reference. Pass a short `label`
     * to make this subscriber identifiable in diagnostic logs
     * (`window.__flatlandFrameClockDebug = true`) and via
     * `clock.subscribers` for leak-hunting.
     */
    subscribe(cb: FrameCallback, label?: string): () => void
    /** Diagnostic: current subscriber count. */
    readonly size: number
    /** Diagnostic: labels of every currently-registered subscriber.
     *  Subscribers that didn't pass a label show as `'(anonymous)'`. */
    readonly subscribers: string[]
}

export type FrameCallback = (timestamp: number) => void

const GLOBAL_KEY = '__flatlandFrameClock'
const DEBUG_KEY = '__flatlandFrameClockDebug'

interface FrameClockWindow extends Window {
    [GLOBAL_KEY]?: FrameClock
    [DEBUG_KEY]?: boolean
}

function isDebug(): boolean {
    if (typeof window === 'undefined') return false
    return Boolean((window as FrameClockWindow)[DEBUG_KEY])
}

function createFrameClock(): FrameClock {
    // Map preserves insertion order AND lets us associate each
    // callback with a debug label for leak-hunting.
    const subs = new Map<FrameCallback, string>()
    let rafId = 0

    function tick(t: number): void {
        // Snapshot to a local array so a subscriber that unsubscribes
        // mid-iteration doesn't reorder the Map's iterator. Cheap for
        // the expected handful of subscribers.
        const local = Array.from(subs.keys())
        for (const cb of local) {
            try {
                cb(t)
            } catch (err) {
                console.error('[frameClock] subscriber threw:', err)
            }
        }
        // Re-arm only if subscribers remain. Falls out cleanly when
        // every subscriber unsubscribed during this tick.
        if (subs.size > 0) {
            rafId = requestAnimationFrame(tick)
        } else {
            rafId = 0
            if (isDebug()) console.debug('[frameClock] parked (0 subs)')
        }
    }

    return {
        subscribe(cb, label) {
            const tag = label ?? '(anonymous)'
            subs.set(cb, tag)
            if (isDebug()) {
                console.debug(
                    `[frameClock] subscribe "${tag}" — size now ${subs.size}`,
                )
            }
            // 0 → 1+ transition: start the chain. Already-running case
            // is the `rafId !== 0` guard.
            if (rafId === 0) {
                if (isDebug()) console.debug('[frameClock] starting rAF chain')
                rafId = requestAnimationFrame(tick)
            }
            return () => {
                if (subs.delete(cb) && isDebug()) {
                    console.debug(
                        `[frameClock] unsubscribe "${tag}" — size now ${subs.size}`,
                    )
                }
                // Don't cancelAnimationFrame here; the in-flight tick
                // will detect `subs.size === 0` and naturally stop.
                // Canceling mid-callback would cut off other subs.
            }
        },
        get size() {
            return subs.size
        },
        get subscribers() {
            return Array.from(subs.values())
        },
    }
}

/**
 * Get (or lazily create) the singleton clock attached to `window`.
 * SSR-safe: returns a no-op stub when window is unavailable so
 * top-level module imports don't crash during Astro's static build.
 *
 * Devtools:
 *   - `window.__flatlandFrameClockDebug = true` then reload to log
 *     subscribe/unsubscribe events.
 *   - `window.__flatlandFrameClock.size` → live subscriber count.
 *   - `window.__flatlandFrameClock.subscribers` → array of labels.
 */
export function getFrameClock(): FrameClock {
    if (typeof window === 'undefined') {
        return {
            subscribe: () => () => {},
            get size() {
                return 0
            },
            get subscribers() {
                return []
            },
        }
    }
    const w = window as FrameClockWindow
    if (!w[GLOBAL_KEY]) {
        w[GLOBAL_KEY] = createFrameClock()
    }
    return w[GLOBAL_KEY]!
}
