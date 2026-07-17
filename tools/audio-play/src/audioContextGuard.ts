/**
 * Installs a guarded global `AudioContext` constructor — imported FIRST
 * in `sidecar.ts`, ahead of `zzfx`/`@zzfx-studio/zzfxm` (this module owns
 * the `node-web-audio-api/polyfill.js` import itself, specifically so
 * nothing can construct a real `AudioContext` before this guard is in
 * place — see `sidecar.ts`'s header comment for the full import-order
 * contract).
 *
 * THE P0 BUG THIS FIXES: `node-web-audio-api`'s native `AudioContext`
 * constructor throws SYNCHRONOUSLY when there's no output device to open
 * (cpal/ALSA finds nothing on a device-less Linux CI runner — see
 * `node_modules/node-web-audio-api/js/AudioContext.js`). `zzfx`'s own
 * module top-level does `audioContext: new AudioContext` completely
 * outside any try/catch this package controls
 * (`node_modules/zzfx/ZzFX.js`) — an unguarded throw there aborts zzfx's
 * ENTIRE module evaluation, which (ES modules: a dependency's top-level
 * throw propagates straight out of the importing `import` statement)
 * aborts `sidecar.ts`'s own module evaluation before a single line of
 * this package's code has run. There is no `try {} catch {}` a
 * *consumer* of `zzfx` can wrap around that from the outside — the only
 * fix is to make the CONSTRUCTOR ITSELF never throw.
 *
 * THE FIX: replace the global `AudioContext` — both `globalThis.
 * AudioContext` and `globalThis.window.AudioContext` (the polyfill
 * installs it on both as genuinely SEPARATE properties, not aliases —
 * see `sidecar.ts`'s `loadWadConstructor` doc comment for why) — with a
 * guarded wrapper, reused for EVERY `new AudioContext()` call anywhere in
 * this process: zzfx's own top-level one, and every acquire/reacquire
 * attempt `contextLifecycle.ts` makes. Real construction is attempted
 * EVERY time (never cached as "permanently unavailable") — so a device
 * that appears after a device-less start is picked up on the very next
 * play, the same reacquire-as-default philosophy `contextLifecycle.ts`
 * already applies to a device that disappears mid-session. A failure
 * flips `isAudioDeviceAvailable()` false and returns a minimal, inert
 * stand-in instead of throwing; a caller can also proactively check
 * `assertAudioDeviceAvailable()` for a clearly-labeled Nack instead of
 * an incidental `TypeError` from calling a real Web Audio method
 * (`createBufferSource`, `createGain`, `decodeAudioData`, ...) on the
 * stand-in — see that function's doc comment for why both exist.
 */
import 'node-web-audio-api/polyfill.js'

const RealAudioContext = globalThis.AudioContext

/** Reflects the OUTCOME of the most recent `new AudioContext()` attempt
 * (real or guarded) — flips false on a failed construction, flips back
 * to true the moment one succeeds. Starts `true`: nothing has attempted
 * a construction yet, and every consumer here already treats "no
 * evidence of failure" as the same thing as "assume it works, find out
 * for real on the first attempt." */
let deviceAvailable = true

/** `true` once the most recent `new AudioContext()` attempt anywhere in
 * this process actually reached a working native context. Read-only
 * observability seam — `assertAudioDeviceAvailable` is what production
 * code should actually call. */
export function isAudioDeviceAvailable(): boolean {
  return deviceAvailable
}

/**
 * Throws a labeled, `commandHandler.ts`-Nackable error when the device
 * is currently degraded — call this at the TOP of every play-kind
 * backend function in `sidecar.ts`, before touching `ZZFX.audioContext`.
 *
 * Not strictly load-bearing for crash-safety by itself (the guarded
 * constructor below already guarantees `ZZFX.audioContext` is never
 * `undefined`/half-constructed, and calling a real Web Audio method on
 * the degraded stand-in throws a plain `TypeError` that
 * `commandHandler.ts`'s existing try/catch already turns into a Nack
 * regardless) — this exists for a CLEAR, intentional error message and
 * `.code` (`'AUDIO_DEVICE_UNAVAILABLE'`) instead of an incidental
 * "`createBufferSource` is not a function", and to skip doing any
 * synthesis/engine-loading work at all when the outcome is already
 * known. Belt and suspenders, not either/or.
 */
export function assertAudioDeviceAvailable(): void {
  if (!deviceAvailable) {
    throw Object.assign(new Error('audio-play: no audio output device available'), {
      code: 'AUDIO_DEVICE_UNAVAILABLE',
    })
  }
}

/**
 * `state: 'closed'` is deliberate, not arbitrary: every existing
 * consumer already treats a closed context as "nothing to release,
 * report honestly, don't touch the analyser, reacquire on the next
 * play" — `contextLifecycle.ts`'s `ensureRunning`/`gatedIdleClose` and
 * `sidecar.ts`'s `getStats` closed-branch both already have exactly
 * this behavior for what used to be only the idle-release case. Reusing
 * it here means the guard needs ZERO new branches in either place — a
 * `stats` query against a device-less sidecar honestly reports
 * `{silent:true, contextState:'closed'}` for free, and the next play's
 * `ensureRunning` ladder naturally attempts a fresh reacquire instead of
 * treating this stand-in as "already running."
 *
 * `close()`/`resume()` resolve immediately (there is nothing real open
 * to wait on) so `contextLifecycle.ts`'s `bounded()` race never has to
 * wait out its own timeout against a degraded context.
 */
function createDegradedContext(): AudioContext {
  return {
    state: 'closed',
    onstatechange: null,
    close: () => Promise.resolve(),
    resume: () => Promise.resolve(),
  } as unknown as AudioContext
}

/**
 * Replaces `new AudioContext(...)` everywhere in this process — via a
 * `Proxy` on the real constructor, NOT a plain wrapper function. The
 * Proxy is load-bearing: the global `AudioContext` must keep its class
 * identity so `ctx instanceof AudioContext`, `new window.AudioContext()`,
 * and the constructor's own static shape all keep working. `tone` /
 * `standardized-audio-context` depend on exactly that — a plain-function
 * replacement broke `Tone.setContext`, so the cold-start retry then
 * Nacked every attempt and surfaced "Tone.js failed to load in time"
 * (caught only by running zzfx-synth-lenses.spec.ts end-to-end).
 *
 * The `construct` trap catches the native device-less throw HERE — the
 * one place it can be caught — rather than letting it propagate out of
 * zzfx's unguardable top-level `new AudioContext` and abort the whole
 * module graph. `Reflect.construct(target, args)` faithfully forwards
 * whatever args `new AudioContext(...)` was called with (zzfx: none;
 * `contextLifecycle.ts`: none today, but stays correct either way). A
 * trap may return any object, so the degraded stand-in on failure is
 * fine.
 */
const GuardedAudioContext = new Proxy(RealAudioContext, {
  construct(target, args) {
    try {
      const ctx = Reflect.construct(target, args) as AudioContext
      deviceAvailable = true
      return ctx
    } catch (err) {
      deviceAvailable = false
      process.stderr.write(
        'audio-play: AudioContext construction failed (no output device?) — ' +
          `degraded, non-fatal: ${err instanceof Error ? err.message : String(err)}\n`
      )
      return createDegradedContext()
    }
  },
})

globalThis.AudioContext = GuardedAudioContext as unknown as typeof AudioContext
globalThis.window.AudioContext = GuardedAudioContext as unknown as typeof AudioContext
// Some browser-targeting packages (e.g. standardized-audio-context, a
// `tone` dependency) fall back to `window.webkitAudioContext` — see this
// package's CLAUDE.md ("Common pitfalls" / `loadWadConstructor`) for why
// both the bare-global and `window`-scoped aliases need patching. Not
// patching this one would let such a fallback bypass the guard entirely.
;(globalThis as unknown as { webkitAudioContext: unknown }).webkitAudioContext = GuardedAudioContext
;(globalThis.window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = GuardedAudioContext
