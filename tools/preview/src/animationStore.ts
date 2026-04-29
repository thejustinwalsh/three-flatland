import { useSyncExternalStore } from 'react'

/**
 * Playback snapshot consumed by the drawer header (▶ button), the PIP
 * (current frame index), and the timeline (cursor position).
 */
export type PlaybackSnapshot = {
  /** Name of the active animation in `meta.animations`, or null. */
  activeAnimation: string | null
  /** Index into the active animation's `frames` array (after duplication). */
  playhead: number
  isPlaying: boolean
}

export type AnimationStore = {
  get(): PlaybackSnapshot
  /**
   * Sub-frame smooth playhead — `snapshot.playhead + accum`, where
   * accum is the fractional progress toward the next whole frame
   * accumulated since the last `tick()` advanced an integer step.
   * Useful for visual playhead indicators that should lerp smoothly
   * between integer frame positions instead of stepping. Read from
   * a render-loop (rAF), not from React state.
   */
  getSmoothPlayhead(): number
  /** Set active animation; resets playhead to 0 and pauses. */
  setActive(name: string | null): void
  /** Toggle play/pause. */
  togglePlay(): void
  play(): void
  pause(): void
  /** Direct seek; clamps to [0, frameCount). */
  seek(index: number): void
  /**
   * Drive playback by `dtMs` (called from the rAF loop). Caller passes
   * frame count + fps + loop flags so the store stays free of any
   * sidecar dependency. Updates playhead and isPlaying (sets isPlaying
   * = false at end of a non-loop animation).
   */
  tick(dtMs: number, frameCount: number, fps: number, loop: boolean, pingPong: boolean): void
  subscribe(fn: () => void): () => void
}

/**
 * Pure-function helper, exported for any other callers that want to
 * derive the next frame given a current state. Forward by default;
 * `pingPong` ignored unless `loop` is also true (ping-pong implies
 * looping back-and-forth). Tolerates arbitrarily large `step` values
 * by reducing through a triangle wave for ping-pong and a modulo for
 * straight loops — callers don't have to clamp step before calling.
 */
export function advancePlayhead(
  current: number,
  step: number,
  frameCount: number,
  loop: boolean,
  pingPong: boolean,
  /** Direction state (for ping-pong). +1 forward, -1 reverse. */
  direction: 1 | -1,
): { playhead: number; direction: 1 | -1; ended: boolean } {
  if (frameCount <= 0) return { playhead: 0, direction, ended: true }
  if (frameCount === 1) return { playhead: 0, direction, ended: !loop }
  // Straight forward / loop / clamp paths — `step` is always positive
  // and direction is the only signal of which way we're moving. When
  // ping-pong is off, force direction = 1 so a stale -1 from a
  // previous ping-pong phase can't drag playback backward.
  if (!pingPong || !loop) {
    const dir: 1 | -1 = pingPong ? direction : 1
    const raw = current + step * dir
    if (raw >= 0 && raw < frameCount) {
      return { playhead: raw, direction: dir, ended: false }
    }
    if (!loop) {
      return raw >= frameCount
        ? { playhead: frameCount - 1, direction: dir, ended: true }
        : { playhead: 0, direction: dir, ended: true }
    }
    // Plain loop wrap; ((x % n) + n) % n handles negatives if any caller
    // passes a negative direction with !pingPong (defensive).
    const wrapped = ((raw % frameCount) + frameCount) % frameCount
    return { playhead: wrapped, direction: dir, ended: false }
  }
  // Ping-pong: parameterise the playhead by a monotonic "phase" walking
  // a triangle wave of period `2 * (frameCount - 1)`. Going forward maps
  // (frame F → phase F); going backward maps (frame F → phase period-F).
  // Step in phase space is always +`step`; the new direction falls out
  // of which half of the triangle we land on.
  const period = 2 * (frameCount - 1)
  const startPhase = direction === 1 ? current : period - current
  const newPhase = ((startPhase + step) % period + period) % period
  if (newPhase < frameCount) {
    return { playhead: newPhase, direction: 1, ended: false }
  }
  return { playhead: period - newPhase, direction: -1, ended: false }
}

/** Stable empty snapshot — referenced by the hook fallback so React's
 *  `useSyncExternalStore` tear-check doesn't see a fresh object on
 *  every render when no store is wired. */
const EMPTY_PLAYBACK: PlaybackSnapshot = { activeAnimation: null, playhead: 0, isPlaying: false }

/**
 * Ref-backed store. Single tick loop driven externally — the consumer
 * (App) wires a useEffect that walks rAF and calls `tick()` whenever
 * isPlaying transitions to true.
 */
export function createAnimationStore(): AnimationStore {
  let snapshot: PlaybackSnapshot = { ...EMPTY_PLAYBACK }
  // Internal direction for ping-pong, hidden from snapshot.
  let direction: 1 | -1 = 1
  // Sub-frame accumulator so a slow rAF (16ms) still advances exactly
  // 1 frame at 60fps and ~0.2 frames at 12fps each tick.
  let accum = 0
  const listeners = new Set<() => void>()
  const emit = () => { for (const l of listeners) l() }

  return {
    get: () => snapshot,
    // Smooth playhead = integer + fractional progress toward the
    // NEXT frame in the current direction. accum is in frame units,
    // post-floor (so 0..1). Multiply by direction so ping-pong's
    // reverse phase reads as `playhead - fraction`, giving a line
    // that lerps smoothly leftward instead of jumping backward
    // every whole frame.
    getSmoothPlayhead: () => {
      const fraction = Math.max(0, Math.min(0.999, accum))
      return snapshot.playhead + fraction * direction
    },
    setActive: (name) => {
      snapshot = { activeAnimation: name, playhead: 0, isPlaying: false }
      direction = 1
      accum = 0
      emit()
    },
    togglePlay: () => {
      snapshot = { ...snapshot, isPlaying: !snapshot.isPlaying }
      accum = 0
      emit()
    },
    play: () => {
      if (snapshot.isPlaying) return
      snapshot = { ...snapshot, isPlaying: true }
      accum = 0
      emit()
    },
    pause: () => {
      if (!snapshot.isPlaying) return
      snapshot = { ...snapshot, isPlaying: false }
      emit()
    },
    seek: (index) => {
      // Reset direction so a seek during ping-pong reverse doesn't keep
      // walking backward from the new index — scrubbing should hand
      // control back to forward play.
      snapshot = { ...snapshot, playhead: Math.max(0, index) }
      direction = 1
      accum = 0
      emit()
    },
    tick: (dtMs, frameCount, fps, loop, pingPong) => {
      if (!snapshot.isPlaying || frameCount === 0 || fps <= 0) return
      // If ping-pong is off (or got toggled off mid-playback), drop
      // any leftover reverse direction from a previous ping-pong
      // phase so playback always proceeds forward. Also keeps
      // getSmoothPlayhead's `fraction * direction` reading right.
      if (!pingPong && direction !== 1) direction = 1
      accum += (dtMs / 1000) * fps
      // Advance whole frames; keep the remainder for next tick.
      const whole = Math.floor(accum)
      if (whole === 0) return
      accum -= whole
      const result = advancePlayhead(snapshot.playhead, whole, frameCount, loop, pingPong, direction)
      direction = result.direction
      snapshot = {
        ...snapshot,
        playhead: result.playhead,
        isPlaying: result.ended ? false : snapshot.isPlaying,
      }
      emit()
    },
    subscribe: (fn) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
  }
}

/** Hook: subscribe to playback state in any component. */
export function useAnimationPlayback(store: AnimationStore | null): PlaybackSnapshot {
  return useSyncExternalStore(
    (fn) => (store ? store.subscribe(fn) : () => {}),
    () => (store ? store.get() : EMPTY_PLAYBACK),
    () => EMPTY_PLAYBACK,
  )
}
