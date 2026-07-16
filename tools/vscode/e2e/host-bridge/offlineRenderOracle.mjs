#!/usr/bin/env node
// Shared render-analysis oracle for the `offline*Probe.mjs` family — pure
// waveform analysis (peak/energy/zero-crossings) + the one-line verdict
// format every probe emits (`RENDER_OK …` / `RENDER_SILENT …`), factored
// out so the five sibling probes don't each hand-roll the same reduction
// loop. This module is NOT production code and imports nothing from
// `tools/audio-play` — every probe still calls the REAL production
// synthesis/output function itself (`playSampleChannels`/`playWadSynth`/
// `playToneSynth`) against its own `OfflineAudioContext`; this only
// analyzes what came out the other end.
//
// `zeroCrossings` — beyond peak/energy — is what makes the oracle catch a
// wrong-frequency, phase-corrupted, or equal-energy-noise-burst render:
// two renders can share peak and energy while having a completely
// different zero-crossing count (a sine at half the intended frequency
// crosses zero half as often at the same amplitude; a DC-offset render
// crosses zero zero times regardless of energy; a single sharp impulse
// vs. a sustained tone of the same energy differ by orders of magnitude
// in crossing count). See `audio-render-gate.spec.ts`'s per-probe bounds
// for how each fixture's expected crossing count was derived.
export function analyzeRender(out) {
  let peak = 0
  let energy = 0
  let zeroCrossings = 0
  let prevSign = 0
  for (const v of out) {
    const a = Math.abs(v)
    if (a > peak) peak = a
    energy += v * v
    if (v !== 0) {
      const sign = v < 0 ? -1 : 1
      if (prevSign !== 0 && sign !== prevSign) zeroCrossings++
      prevSign = sign
    }
  }
  return { peak, energy, zeroCrossings, frames: out.length }
}

/** Reads an `OfflineAudioContext`'s already-rendered buffer (channel 0)
 * via `copyFromChannel` (never `getChannelData` — see `player.ts`'s file
 * doc comment for why the read side matters too) and analyzes it. */
export function analyzeRenderedBuffer(renderedBuffer) {
  const out = new Float32Array(renderedBuffer.length)
  renderedBuffer.copyFromChannel(out, 0)
  return analyzeRender(out)
}

export function printVerdict({ peak, energy, zeroCrossings, frames }) {
  console.log(
    peak > 1e-3
      ? `RENDER_OK peak=${peak.toFixed(4)} energy=${energy.toFixed(1)} frames=${frames} zeroCrossings=${zeroCrossings}`
      : `RENDER_SILENT peak=${peak.toFixed(6)} energy=${energy.toFixed(6)}`
  )
}
