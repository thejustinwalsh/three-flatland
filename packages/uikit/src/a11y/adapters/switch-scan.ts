import type { Component } from '../../components/component.js'
import type { A11yFocusManager } from '../focus-manager.js'

export interface SwitchScanOptions {
  /** Time between auto-advances, in ms. Default 1200. */
  intervalMs?: number
  /** Call `start()` on creation. Default false. */
  autoStart?: boolean
  /** Wrap to the first focusable after the last, instead of halting. Default true. */
  loop?: boolean
  /** For desktop testing: bind Space as the switch while the scan is running. Default false. */
  bindSpaceKey?: boolean
}

export interface SwitchScanController {
  /** Begin scanning from a fresh lap: rebinds the timer and (re)starts the walk at the top. */
  start(): void
  /** Halt the timer and reset the walk — a later `start()` begins a fresh lap. */
  stop(): void
  /** Halt the timer but keep the current focus position for `resume()`. */
  pause(): void
  /** Restart the timer, continuing the walk from wherever it was paused. */
  resume(): void
  /** Activate the currently-focused control — the switch-press action. */
  switchPress(): void
  /** Stop and unbind; the controller cannot be restarted afterward. */
  dispose(): void
  /** Whether the auto-advance timer is currently armed. */
  readonly running: boolean
}

const DEFAULT_INTERVAL_MS = 1200

/**
 * Single/dual-switch scanning adapter (Game Accessibility Guidelines — motor access): a switch
 * user cannot Tab between controls, so focus auto-advances over `manager`'s focusables on a timer
 * and a switch press activates whichever control is currently focused. Also usable on desktop with
 * Space as the switch (`bindSpaceKey`) for testing without switch hardware.
 *
 * Drives {@link A11yFocusManager} exclusively through its public sequential-focus/activation API —
 * `focusFirst`/`focusNext`/`activateFocused` — so it inherits the manager's spatial ordering,
 * reveal policy, and DOM mirroring for free.
 */
export function createSwitchScan(
  manager: A11yFocusManager,
  options?: SwitchScanOptions
): SwitchScanController {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS
  const loop = options?.loop ?? true
  const bindSpaceKey = options?.bindSpaceKey ?? false

  let timer: ReturnType<typeof setInterval> | undefined
  // The distinct components focused during the CURRENT lap. Lap completion is detected by re-landing
  // on an already-visited control (a wrap) or by having covered every current focusable — robust to
  // the focusable set changing mid-lap (e.g. activation disabling/removing the focused control),
  // which a raw advance counter mis-handled, skipping entries (codex P3-round2 #3). Fresh at
  // `start()`/`stop()`, preserved across `pause()`/`resume()`.
  let visited = new Set<Component>()
  // True from `start()` until the lap's first tick fires. Deliberately NOT inferred from
  // `manager.focused` — `stop()` intentionally leaves the manager's focus alone (only the scan's
  // own walk position resets), so a stale non-null focus must not be mistaken for "mid-walk".
  let freshLap = true
  let running = false
  let keyBound = false
  let disposed = false

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== ' ' && event.key !== 'Spacebar') {
      return
    }
    event.preventDefault()
    switchPress()
  }

  const bindKey = (): void => {
    if (!bindSpaceKey || keyBound || typeof document === 'undefined') {
      return
    }
    document.addEventListener('keydown', onKeyDown)
    keyBound = true
  }

  const unbindKey = (): void => {
    if (!keyBound || typeof document === 'undefined') {
      return
    }
    document.removeEventListener('keydown', onKeyDown)
    keyBound = false
  }

  const clearTimer = (): void => {
    if (timer != null) {
      clearInterval(timer)
      timer = undefined
    }
  }

  // Landing on the LAST still-unvisited control completes the lap on THIS tick, so `loop:false` halts
  // immediately instead of one interval later, and `loop` restarts on the next tick (codex P3-round2 #4).
  const completeLap = (): void => {
    if (loop) {
      freshLap = true
    } else {
      stop()
    }
  }

  const completeLapIfCovered = (): void => {
    const focusables = manager.focusables.value
    if (focusables.length > 0 && focusables.every((component) => visited.has(component))) {
      completeLap()
    }
  }

  const tick = (): void => {
    if (manager.focusables.value.length === 0) {
      return
    }
    if (freshLap) {
      manager.focusFirst()
      const landed = manager.focused.value
      if (landed == null) {
        return // focusFirst refused — retry as a fresh lap next tick, do not start counting.
      }
      visited = new Set([landed])
      freshLap = false
      completeLapIfCovered()
      return
    }
    const before = manager.focused.value
    manager.focusNext()
    const landed = manager.focused.value
    if (landed == null) {
      return // focus went nowhere (everything refused) → wait, do NOT end the lap.
    }
    if (landed === before) {
      // No movement is a REFUSED advance, not a wrap — do not treat it as a completed lap (codex
      // P3-round3 #3). Complete only if the set has shrunk to already-visited members; otherwise retry
      // next tick. (The sole-focusable case already completed via completeLapIfCovered on its landing.)
      completeLapIfCovered()
      return
    }
    if (visited.has(landed)) {
      // MOVED onto an already-scanned control → a genuine wrap → the lap is complete.
      completeLap()
      return
    }
    visited.add(landed)
    completeLapIfCovered()
  }

  function start(): void {
    if (disposed || running) {
      return
    }
    running = true
    visited = new Set()
    freshLap = true
    bindKey()
    timer = setInterval(tick, intervalMs)
  }

  function stop(): void {
    clearTimer()
    running = false
    visited = new Set()
    freshLap = true
    unbindKey()
  }

  function pause(): void {
    if (!running) {
      return
    }
    clearTimer()
    running = false
    unbindKey()
  }

  function resume(): void {
    if (disposed || running) {
      return
    }
    running = true
    bindKey()
    timer = setInterval(tick, intervalMs)
  }

  function switchPress(): void {
    manager.activateFocused({ source: 'switch' })
  }

  function dispose(): void {
    if (disposed) {
      return
    }
    stop()
    disposed = true
  }

  const controller: SwitchScanController = {
    start,
    stop,
    pause,
    resume,
    switchPress,
    dispose,
    get running() {
      return running
    },
  }

  if (options?.autoStart ?? false) {
    controller.start()
  }

  return controller
}
