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
 * looping back-and-forth).
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
  let next = current + step * direction
  let nextDir: 1 | -1 = direction
  let ended = false
  if (next >= frameCount) {
    if (pingPong && loop) {
      // Bounce: walk back from the last frame
      next = frameCount - 2 - (next - frameCount)
      nextDir = -1
    } else if (loop) {
      next = next % frameCount
    } else {
      next = frameCount - 1
      ended = true
    }
  } else if (next < 0) {
    // Only reachable in ping-pong reverse phase
    if (pingPong && loop) {
      next = -next
      nextDir = 1
    } else {
      next = 0
      ended = true
    }
  }
  return { playhead: next, direction: nextDir, ended }
}

/**
 * Ref-backed store. Single tick loop driven externally — the consumer
 * (App) wires a useEffect that walks rAF and calls `tick()` whenever
 * isPlaying transitions to true.
 */
export function createAnimationStore(): AnimationStore {
  let snapshot: PlaybackSnapshot = { activeAnimation: null, playhead: 0, isPlaying: false }
  // Internal direction for ping-pong, hidden from snapshot.
  let direction: 1 | -1 = 1
  // Sub-frame accumulator so a slow rAF (16ms) still advances exactly
  // 1 frame at 60fps and ~0.2 frames at 12fps each tick.
  let accum = 0
  const listeners = new Set<() => void>()
  const emit = () => { for (const l of listeners) l() }

  return {
    get: () => snapshot,
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
      snapshot = { ...snapshot, playhead: Math.max(0, index) }
      accum = 0
      emit()
    },
    tick: (dtMs, frameCount, fps, loop, pingPong) => {
      if (!snapshot.isPlaying || frameCount === 0 || fps <= 0) return
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
    () => (store ? store.get() : { activeAnimation: null, playhead: 0, isPlaying: false }),
    () => ({ activeAnimation: null, playhead: 0, isPlaying: false }),
  )
}
