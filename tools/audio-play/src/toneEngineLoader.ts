/**
 * Tone.js bring-up — environment shims, the lazy `import('tone')`,
 * `Tone.setContext`, and the explicit nine-class `ToneEngine` table —
 * extracted verbatim (refactor-only) from `sidecar.ts`'s original
 * module-scope shim lines + `loadToneEngine()` closure, so
 * `tools/vscode/e2e/host-bridge/offlineToneProbe.mjs`/
 * `offlineTonePluckProbe.mjs` can call the EXACT production
 * initialization against an `OfflineAudioContext`, instead of
 * reimplementing it (which previously let a regression in the
 * `isSecureContext`/`self` shims stay green — see
 * `tools/vscode/e2e/specs/audio-render-gate.spec.ts`'s PluckSynth test).
 * `sidecar.ts` calls this with `ZZFX.audioContext`; the offline probes
 * call it with an `OfflineAudioContext`. Only the context differs — see
 * `tools/audio-play/CLAUDE.md`'s AudioWorklet section for the full
 * empirical trace this preserves.
 */
import type { ToneEngine } from './player.js'

type ToneModule = typeof import('tone')

/**
 * `standardized-audio-context` (a `tone` dependency, NOT
 * `node-web-audio-api` — `Tone.setContext` doesn't touch this path at
 * all) computes its exported `AudioWorkletNode` ONCE, at ITS OWN
 * module-evaluation time, gated on `window.isSecureContext` — our shim
 * `window` (from `node-web-audio-api/polyfill.js`) never sets that
 * real-browser-only flag, so without this the export is permanently
 * `undefined`, which crashes the ENTIRE process the moment any
 * AudioWorklet-based Tone node (`PluckSynth`'s internal
 * `LowpassCombFilter`) gets constructed. Separately, `tone`'s own
 * `createAudioWorkletNode` picks its constructor via
 * `typeof self === "object" ? self : null` — `self` isn't a Node global
 * at all, so without `self ??= window` that throws a second, different
 * `TypeError`. Idempotent — safe to call more than once — but MUST run
 * before `tone` (or anything that transitively imports
 * `standardized-audio-context`) is imported for the FIRST time anywhere
 * in this process, not just before this module's own `import('tone')`
 * below. `loadToneEngine` below always calls this immediately before its
 * own `import('tone')`; a caller that needs to import `tone` itself for
 * some other reason before calling `loadToneEngine` (see
 * `offlineToneProbe.mjs`'s eager-default-context dispose) must call this
 * explicitly first.
 */
export function setupToneEnvironment(): void {
  globalThis.window.isSecureContext = true
  globalThis.self ??= globalThis.window
}

/** Builds the `ToneEngine` class table `player.ts`'s `playToneSynth`
 * needs from an already-imported real `tone` module — the same explicit,
 * hand-built table `sidecar.ts` always constructed inline. A real,
 * explicit table, never `Tone[synthType]` indexed dynamically off the
 * wire string (defense in depth — see `player.ts`'s `ToneEngine` doc
 * comment). */
function buildToneEngine(Tone: ToneModule): ToneEngine {
  return {
    classes: {
      Synth: Tone.Synth,
      AMSynth: Tone.AMSynth,
      FMSynth: Tone.FMSynth,
      DuoSynth: Tone.DuoSynth,
      MembraneSynth: Tone.MembraneSynth,
      MetalSynth: Tone.MetalSynth,
      PluckSynth: Tone.PluckSynth,
      NoiseSynth: Tone.NoiseSynth,
      // `Tone.PolySynth`'s real type is generic over its voice class — see
      // `player.ts`'s `ToneEngine` doc comment for why this is the one
      // point the simplified `ToneEngine` type and the real Tone type meet.
      PolySynth: Tone.PolySynth as unknown as ToneEngine['classes']['PolySynth'],
    },
    Time: (value) => Tone.Time(value),
  }
}

export type LoadedToneEngine = {
  engine: ToneEngine
  /** Re-binds Tone to a different context — the same shape `sidecar.ts`'s
   * `toneApi` needs for `contextLifecycle.ts`'s `onReacquired` hook. */
  setContext: (ctx: AudioContext) => void
  /** The live Tone `Context` wrapper bound by THIS call's
   * `Tone.setContext` — exposes `dispose()` (lifecycle rebind) and
   * `workletsAreReady()` (offline-render callers only: `Context`'s real
   * `.d.ts` marks the latter `protected`, so this return type widens it
   * to public — a type-level cast only, not a runtime one, matching this
   * codebase's existing pattern for reaching into Tone's non-public
   * surface, e.g. `player.ts`'s `toneReleaseSeconds`). */
  getContext: () => { dispose(): void; workletsAreReady(): Promise<void> }
}

/**
 * Production Tone.js bring-up: environment shims, the lazy
 * `import('tone')`, binding `context` via `Tone.setContext`, and the
 * explicit nine-class `ToneEngine` table — the exact sequence
 * `sidecar.ts`'s own `loadToneEngine()` used to inline.
 */
export async function loadToneEngine(context: AudioContext): Promise<LoadedToneEngine> {
  setupToneEnvironment()
  const Tone = await import('tone')
  Tone.setContext(context)
  return {
    engine: buildToneEngine(Tone),
    setContext: (ctx) => Tone.setContext(ctx),
    getContext: () => Tone.getContext() as unknown as { dispose(): void; workletsAreReady(): Promise<void> },
  }
}
