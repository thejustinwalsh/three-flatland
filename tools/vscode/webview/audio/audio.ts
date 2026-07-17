import { toDenseArgs, type ZzfxParams } from './params'

// `zzfx` constructs its own `AudioContext` as a MODULE-LEVEL side effect
// (`export const ZZFX = { ..., audioContext: new AudioContext, ... }`).
// Browsers create an AudioContext "suspended" unless it's constructed
// synchronously inside a user-gesture handler — so we dynamic-import the
// package (deferring that construction) rather than importing at module
// scope, and explicitly resume() before playing. Since the waveform
// preview also loads the module (for `buildSamples`) shortly after mount,
// the context is in practice constructed pre-gesture and starts
// suspended — the resume() call inside the Play click handler is what
// satisfies the user-gesture requirement, and it's required regardless:
// some browsers don't auto-resume a context created moments earlier in
// the same tick even when that construction WAS gesture-adjacent.
let modulePromise: Promise<typeof import('zzfx')> | null = null

function loadZzfx() {
  if (!modulePromise) modulePromise = import('zzfx')
  return modulePromise
}

// User playback-volume trim (a linear gain multiplier, 1 = the untouched
// baseline) — module state rather than a per-call argument so EVERY play
// entry point (toolbar Play, the host-pushed CodeLens route, candidate/
// preset cards) picks it up from the one place App.tsx wires it
// (session.playbackVolume → setPlaybackVolume). Applied by scaling
// ZZFX.volume against its captured baseline right before each play — the
// same "master gain × trim" math the inline sidecar route applies, so
// the two paths sound identical for the same setting.
let playbackMultiplier = 1
let baselineVolume: number | null = null

export function setPlaybackVolume(multiplier: number): void {
  playbackMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1
}

/** A just-started playback, timed against zzfx's own AudioContext clock —
 * enough for the waveform preview to sweep a playhead without touching
 * Web Audio itself. */
export type PlaybackHandle = {
  context: AudioContext
  /** `context.currentTime` at the moment playback started. */
  startedAt: number
  /** Seconds — the started buffer's full length. */
  duration: number
}

/**
 * Plays `params` through zzfx. Must be called from inside (or shortly
 * after) a user gesture — see the module doc comment above.
 */
export async function playParams(params: ZzfxParams): Promise<PlaybackHandle> {
  const { zzfx, ZZFX } = await loadZzfx()
  if (ZZFX.audioContext.state === 'suspended') {
    await ZZFX.audioContext.resume()
  }
  // Capture zzfx's shipped master volume ONCE, then scale from that
  // baseline — never from the current (possibly already-scaled) value,
  // which would compound the trim across plays.
  baselineVolume ??= ZZFX.volume
  ZZFX.volume = baselineVolume * playbackMultiplier
  const node = zzfx(...toDenseArgs(params))
  return {
    context: ZZFX.audioContext,
    startedAt: ZZFX.audioContext.currentTime,
    duration: node.buffer?.duration ?? 0,
  }
}

/**
 * Synthesizes the full sample buffer for `params` without playing it —
 * zzfx's own `buildSamples`, i.e. exactly what `playParams` would emit.
 * Safe to call outside a user gesture: it never touches the (possibly
 * suspended) AudioContext's output.
 */
export async function synthesizeSamples(params: ZzfxParams): Promise<{ samples: Float32Array; sampleRate: number }> {
  const { ZZFX } = await loadZzfx()
  return { samples: ZZFX.buildSamples(...toDenseArgs(params)), sampleRate: ZZFX.sampleRate }
}
