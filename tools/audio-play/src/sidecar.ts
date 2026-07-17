/**
 * The sidecar entry point — spawned by `client.ts` as
 * `child_process.spawn(process.execPath, [thisFile], { env: { ...,
 * ELECTRON_RUN_AS_NODE: '1' } })`, run from *inside* the real VS Code
 * extension host. `process.execPath`, read from within the extension
 * host, already resolves to `Code Helper (Plugin)` (the utility-process
 * binary VS Code itself spawns Node-mode children from) — that binary
 * carries the `com.apple.security.cs.disable-library-validation`
 * entitlement the main `Code`/Electron binary does NOT have, which is
 * what makes loading node-web-audio-api's unsigned prebuilt `.node`
 * binary possible at all on macOS's hardened runtime. See
 * `tools/audio-play/CLAUDE.md` for the full prototype-gate writeup — this
 * comment is the load-bearing "why," not decoration.
 *
 * Importing `./audioContextGuard.js` FIRST (before `zzfx`/`@zzfx-studio/
 * zzfxm`) is required for two layered reasons: `zzfx`'s `ZZFX.audioContext
 * = new AudioContext` runs at *module load time*, so `AudioContext` must
 * already be a real global by then (that module owns the `node-web-
 * audio-api/polyfill.js` import itself, for exactly this ordering) — AND
 * that same global must already be the GUARDED constructor, not the raw
 * native one, because `node-web-audio-api`'s native constructor throws
 * SYNCHRONOUSLY on a device-less runner (no cpal/ALSA output device),
 * and zzfx's top-level `new AudioContext` call is completely outside any
 * try/catch this package controls — an unguarded throw there would abort
 * zzfx's module evaluation and crash this whole process before a single
 * line below has run. See `audioContextGuard.ts`'s file doc comment for
 * the full mechanism (and `tools/audio-play/CLAUDE.md`'s device-tolerance
 * section for the production rationale).
 *
 * Synthesis stays real, unmodified upstream zzfx/zzfxm — `ZZFX.buildSamples`
 * and `ZZFXM.build` are pure numeric waveform generation, no AudioContext
 * touch at all, so calling them directly (instead of the `zzfx()`/`zzfxm()`
 * convenience wrappers) is zero fidelity drift from what those packages
 * produce. Only the OUTPUT step — samples into a playable buffer — is
 * replaced, in `player.ts`, because `node-web-audio-api`'s `AudioBuffer`
 * doesn't support the get-then-mutate pattern those wrappers rely on (see
 * that file's doc comment for the root cause).
 *
 * The command state machine itself (song replacement, stop semantics)
 * lives in `commandHandler.ts`, injected with this real zzfx/zzfxm-backed
 * `AudioBackend` — see that file's tests for the state machine covered
 * without a real `AudioContext`. This file is only the stdin/stdout
 * wiring + the one real backend implementation.
 */
import { assertAudioDeviceAvailable, isAudioDeviceAvailable } from './audioContextGuard.js'
import * as fs from 'node:fs/promises'
import * as readline from 'node:readline'
import { ZZFX } from 'zzfx'
import { ZZFXM } from '@zzfx-studio/zzfxm'
import type { Command, Response } from './protocol.js'
import { createCommandHandler } from './commandHandler.js'
import { createContextLifecycle } from './contextLifecycle.js'
import {
  getPlaybackStats,
  liveSourceCount,
  playBuffer,
  playSampleChannels,
  playToneSynth,
  playWadSynth,
  type ToneEngine,
} from './player.js'
import { loadToneEngine as loadToneEngineForContext } from './toneEngineLoader.js'
import { loadWadConstructor, resetWadConstructorCache } from './wadLoader.js'

// `tone`'s AudioWorklet-based nodes (`Tone.PluckSynth`'s internal
// `LowpassCombFilter`) go through `standardized-audio-context`, a
// dependency of `tone` itself, NOT through `node-web-audio-api` directly —
// `Tone.setContext(ZZFX.audioContext)` doesn't change that. Traced
// empirically (a throwaway diagnostic constructing `new Tone.PluckSynth()`
// against the real polyfilled context): `standardized-audio-context`'s
// `src/factories/window.ts` reads the bare `window` global (present here,
// via the polyfill's `globalThis.window` shim) and `src/factories/
// is-secure-context.ts` then reads `window.isSecureContext` — a real
// browser-only property our shim `window` object never sets, so it's
// `undefined`. That makes `standardized-audio-context`'s exported
// `AudioWorkletNode` permanently `undefined` (`build/es2019/module.js`:
// `const audioWorkletNodeConstructor = isSecureContext ? … : undefined`),
// which crashes the ENTIRE sidecar process — not a clean Nack — the moment
// any AudioWorklet-based Tone node gets constructed: `tone`'s own
// `ToneAudioWorklet` constructor
// (`build/esm/core/worklet/ToneAudioWorklet.js`) calls
// `context.addAudioWorkletModule(…).then(() => this.context.
// createAudioWorkletNode(…))`, and `createAudioWorkletNode`'s
// `assert(isDefined(stdAudioWorkletNode), …)` (`build/esm/core/context/
// AudioContext.js`) throws INSIDE that unawaited `.then()` — an unhandled
// promise rejection Node treats as fatal, killing zzfx/zzfxm/every other
// in-flight sound along with it, not just the one Tone call. Fix
// (`window.isSecureContext = true` + `self ??= window`) — and the full
// empirical trace of why it works — now lives in `toneEngineLoader.ts`'s
// `setupToneEnvironment`/`loadToneEngine`, called below via
// `loadToneEngineForContext`; this file no longer sets the shims itself.

// Defined before `handler` — the real `playFile` backend below closes
// over this directly to report an async decode/read failure, since
// `handleCommand` has already returned its synchronous "accepted" ack by
// the time that failure is known (see `commandHandler.ts`'s
// `AudioBackend.playFile` doc comment).
function send(response: Response): void {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

// --- Tone.js: lazy, dynamic import (#47). `tone` is pure ESM (no
// synchronous CJS load path — see `wadLoader.ts`'s `loadWadConstructor`
// for the contrast), so a genuinely lazy "only import on first use" load is
// inherently asynchronous. `AudioBackend.playToneSynth` is allowed to be
// async precisely for this reason (see `commandHandler.ts`'s doc
// comment): the backend AWAITS `toneEnginePromise` (bounded, see
// `loadToneEngineBounded` below) before ever constructing a synth, so the
// command's own Ack/Nack always reflects whether the engine actually
// became ready — never a "still loading, try again" Nack that pushes the
// retry burden onto the caller. `toneEnginePromise` is cached and
// idempotent — every call after the first (cold or not) reuses the same
// promise (already-resolved, in the overwhelmingly common case).
let toneEnginePromise: Promise<ToneEngine> | undefined
/** The slice of the Tone module the context lifecycle needs to re-bind
 * a reacquired context (Tone captured the old one via setContext). */
let toneApi: { setContext: (ctx: AudioContext) => void; getContext: () => { dispose(): void } } | undefined

function loadToneEngine(): Promise<ToneEngine> {
  if (!toneEnginePromise) {
    // Tone.Context runs a lookAhead ticker — set the real context ONCE
    // per CONTEXT, the moment Tone is first actually needed, never
    // per-play (a fresh Tone context per play would leak native
    // resources). Re-bound by the lifecycle's onReacquired when the
    // underlying context is swapped. `loadToneEngineForContext`
    // (`toneEngineLoader.ts`) owns the env shims + `import('tone')` +
    // `Tone.setContext` + engine-table construction — this closure only
    // adds the sidecar's own caching + `toneApi` bookkeeping on top.
    toneEnginePromise = loadToneEngineForContext(ZZFX.audioContext).then(({ engine, setContext, getContext }) => {
      toneApi = { setContext, getContext }
      return engine
    })
  }
  return toneEnginePromise
}

/** How long `playToneSynth` will wait for the Tone.js engine before
 * Nacking with `TONE_LOAD_FAILED` — overridable like
 * `FL_AUDIO_IDLE_RELEASE_MS` for e2e tuning. Bounded so a wedged
 * `import('tone')` (broken fs, corrupted install) can never stall the
 * sidecar's serialized command chain forever — the same "never hang"
 * posture `contextLifecycle.ts`'s `bounded()` applies to native device
 * calls, just for a module import instead of a device operation. */
const TONE_LOAD_TIMEOUT_MS = Number(process.env.FL_AUDIO_TONE_LOAD_TIMEOUT_MS ?? 10_000)

/**
 * Races `loadToneEngine()` against `TONE_LOAD_TIMEOUT_MS`. A timeout (or
 * a genuine `import('tone')` rejection) rejects with a `TONE_LOAD_FAILED`-
 * coded error — `commandHandler.ts`'s catch turns that into a Nack, never
 * an uncaught exception. Losing the race does NOT cancel or reset
 * `toneEnginePromise` — it keeps racing in the background (dynamic
 * imports aren't cancellable, and there's no reason to throw away
 * in-flight work), so a late resolution still warms the cache for the
 * very next `playToneSynth` call. That's what makes this self-healing
 * without any retry logic on the caller's side: a slow-but-not-hung
 * first attempt Nacks once, and the second attempt (whenever the user
 * clicks Play again) finds the engine already loaded.
 */
function loadToneEngineBounded(): Promise<ToneEngine> {
  return new Promise<ToneEngine>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        Object.assign(new Error(`Tone.js did not finish loading within ${TONE_LOAD_TIMEOUT_MS}ms`), {
          code: 'TONE_LOAD_FAILED',
        })
      )
    }, TONE_LOAD_TIMEOUT_MS)
    loadToneEngine().then(
      (engine) => {
        clearTimeout(timer)
        resolve(engine)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(
          Object.assign(new Error(err instanceof Error ? err.message : String(err)), {
            code: 'TONE_LOAD_FAILED',
          })
        )
      }
    )
  })
}

// --- Wad: `web-audio-daw` is a plain CJS/UMD bundle (no `"type"` field
// in its package.json), so — unlike `tone` — a synchronous `require()`
// keeps `playWadSynth`'s backend genuinely synchronous on every call,
// including the first: no cold-start race to Nack around. The
// constructor-adoption dance (the `AudioContext`/`webkitAudioContext`
// monkey-patch, both the bare-global AND `window`-scoped copies) and the
// noise-buffer `copyToChannel` repair now live in `wadLoader.ts`'s
// `loadWadConstructor` — see that file for the full empirical trace
// (`tools/audio-play/CLAUDE.md`'s "noise-buffer" pitfall has the original
// write-up). `resetWadConstructorCache` (also from `wadLoader.ts`) is
// called from the lifecycle's `onReacquired` hook below, since Wad
// captures its context PERMANENTLY at CJS module load — the only cure
// after a context swap is a require-cache bust forcing the next
// `loadWadConstructor` call to re-run the full adoption dance.

const handler = createCommandHandler({
  // `volume` is the wire command's user-trim multiplier (handler defaults
  // it to 1) — applied on top of ZZFX.volume so 1 is byte-for-byte
  // today's baseline loudness.
  //
  // Every play-kind backend below starts with `assertAudioDeviceAvailable()`
  // — see that function's doc comment in `audioContextGuard.ts` for why
  // this exists on top of (not instead of) the guarded `AudioContext`
  // itself never throwing: a clear, labeled Nack instead of an incidental
  // TypeError, and skipping synthesis/engine-loading work whose outcome
  // is already known.
  play: (params, volume) => {
    assertAudioDeviceAvailable()
    playSampleChannels(ZZFX.audioContext, [ZZFX.buildSamples(...params)], ZZFX.sampleRate, ZZFX.volume * volume)
  },
  playSong: (song, volume) => {
    assertAudioDeviceAvailable()
    return playSampleChannels(
      ZZFX.audioContext,
      ZZFXM.build(song.instruments, song.patterns, song.sequence, song.bpm),
      ZZFX.sampleRate,
      ZZFX.volume * volume
    )
  },
  // Fire-and-forget: `fs.readFile` + `decodeAudioData` are both async,
  // but `handleCommand` (and the `rl.on('line', ...)` loop it runs
  // inside) must never block on them — see `tools/audio-play/CLAUDE.md`'s
  // "the async wrinkle". A read/decode failure is reported directly via
  // `send`, not thrown — there is no longer a live `handleCommand` call
  // stack to throw into by the time this `catch` runs. `onStarted` hands
  // the started source back to the command handler so the file becomes
  // the current STOPPABLE source (#46) — the handler's generation guard
  // owns the "decode landed after a newer play" race.
  playFile: (filePath, volume, onStarted) => {
    void (async () => {
      try {
        assertAudioDeviceAvailable()
        const bytes = await fs.readFile(filePath)
        const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        const audioBuffer = await ZZFX.audioContext.decodeAudioData(arrayBuffer)
        onStarted(playBuffer(ZZFX.audioContext, audioBuffer, ZZFX.volume * volume))
      } catch (err) {
        // `.code` rides along the same way the synchronous Nack path
        // does (see `commandHandler.ts`'s catch) — `assertAudioDeviceAvailable`
        // throws with a `.code` of `AUDIO_DEVICE_UNAVAILABLE`; a real
        // read/decode failure has none, and this omits the field rather
        // than fabricating one.
        const code = err instanceof Error && 'code' in err ? String((err as { code?: unknown }).code) : undefined
        send({
          ok: false,
          cmd: 'playFile',
          error: err instanceof Error ? err.message : String(err),
          ...(code !== undefined ? { code } : {}),
        })
      }
    })()
  },
  // Device check FIRST (fast-fail on a device-less runner without paying
  // for a Tone.js import that would be moot anyway), THEN await the
  // bounded engine load — see loadToneEngineBounded's doc comment.
  playToneSynth: async (cmd, volume) => {
    assertAudioDeviceAvailable()
    const engine = await loadToneEngineBounded()
    return playToneSynth(ZZFX.audioContext, engine, cmd, ZZFX.volume * volume)
  },
  playWadSynth: (config, volume) => {
    assertAudioDeviceAvailable()
    const WadCtor = loadWadConstructor(ZZFX.audioContext)
    return playWadSynth(ZZFX.audioContext, WadCtor, config, ZZFX.volume * volume)
  },
  getStats: () => {
    // A closed (idle-released or dead) context reports honestly WITHOUT
    // touching the analyser (createAnalyser/getFloatTimeDomainData can
    // throw on a closed context) and without acquiring one — never
    // acquire a context just to ask, the same symmetry as
    // playSidecarManager's "never spawns one just to ask".
    if (ZZFX.audioContext.state === 'closed') {
      return {
        peak: 0,
        silent: true,
        playing: false,
        durationSeconds: 0,
        elapsedSeconds: 0,
        contextState: 'closed' as const,
      }
    }
    return getPlaybackStats(ZZFX.audioContext)
  },
})

const rl = readline.createInterface({ input: process.stdin })

const PLAY_COMMANDS: ReadonlySet<Command['cmd']> = new Set([
  'play',
  'playSong',
  'playFile',
  'playToneSynth',
  'playWadSynth',
])

// Serializes command handling so the lifecycle's awaited resume/close/
// reacquire cannot reorder responses relative to their commands — the
// strict stdin-order guarantee is what makes response ordering trivially
// reasoned about (see protocol.ts's doc comment). Always the caught
// tail, so one failed link can't halt the chain. The idle close runs
// through this same chain (see contextLifecycle.ts), which makes
// close-vs-play races impossible by construction.
let commandChain: Promise<void> = Promise.resolve()

const log = (message: string): void => {
  process.stderr.write(`audio-play: ${message}\n`)
}

// State transitions, on stderr — the native binding wires `onstatechange`
// through; with the client forwarding stderr (PlaySidecarClient.onStderr)
// a late suspend/interruption is visible instead of silent. Re-wired for
// every reacquired context.
function wireStateLogging(ctx: AudioContext): void {
  ctx.onstatechange = () => {
    log(`AudioContext state changed → '${ctx.state}'`)
  }
}
wireStateLogging(ZZFX.audioContext)

/** Reacquire-as-default context lifecycle — see contextLifecycle.ts. */
const lifecycle = createContextLifecycle({
  getCurrent: () => ZZFX.audioContext,
  setCurrent: (ctx) => {
    ZZFX.audioContext = ctx
    wireStateLogging(ctx)
  },
  createContext: () => new AudioContext(),
  // Each engine's rebind is guarded INDEPENDENTLY — one engine failing
  // must not skip the other's rebind (and the lifecycle guards the whole
  // hook too, so ensureRunning's never-throws contract holds regardless).
  onReacquired: (ctx) => {
    // Tone captured the old context via setContext at engine load —
    // re-bind, disposing the old wrapper's lookAhead ticker first (its
    // raw context is already closed; dispose failures are non-fatal).
    if (toneApi) {
      try {
        toneApi.getContext().dispose()
      } catch (err) {
        log(`tone context dispose failed (non-fatal): ${err instanceof Error ? err.message : err}`)
      }
      try {
        toneApi.setContext(ctx)
      } catch (err) {
        log(
          `tone setContext failed — Tone stays bound to the OLD (dead) context; tone plays will Nack until it rebinds: ${err instanceof Error ? err.message : err}`
        )
      }
    }
    // Wad captured the old context PERMANENTLY at its CJS module load
    // (window.AudioContext read once — see wadLoader.ts's
    // loadWadConstructor). The only cure is a cache bust: the next
    // playWadSynth re-runs the full adoption dance (FakeAudioContext +
    // noise re-commit) against the fresh context.
    resetWadConstructorCache(log)
  },
  isQuiet: () => {
    const stats = getPlaybackStats(ZZFX.audioContext)
    return {
      liveSources: liveSourceCount(ZZFX.audioContext),
      playing: stats.playing,
      silent: stats.silent,
    }
  },
  enqueue: (fn) => {
    commandChain = commandChain.then(fn).catch((err: unknown) => {
      log(`idle-release error: ${err instanceof Error ? err.message : String(err)}`)
    })
  },
  log,
  idleMs: Number(process.env.FL_AUDIO_IDLE_RELEASE_MS ?? 45_000),
})

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return

  let command: Command
  try {
    command = JSON.parse(trimmed) as Command
  } catch (err) {
    process.stderr.write(
      `audio-play: malformed command (not JSON): ${trimmed} (${err instanceof Error ? err.message : String(err)})\n`
    )
    return
  }

  commandChain = commandChain
    .then(async () => {
      if (PLAY_COMMANDS.has(command.cmd)) await lifecycle.ensureRunning(command.cmd)
      // Awaited — `handleCommand` always returns a Promise now (see
      // commandHandler.ts's doc comment); `playToneSynth` is the one
      // command whose backend call genuinely awaits (the bounded Tone
      // engine load), so this line can legitimately take a while on a
      // cold sidecar's first Tone play. That's fine: the command chain
      // is already strictly serialized, and a queued command behind it
      // just waits its turn like it always has for any bounded
      // lifecycle/device operation.
      const response = await handler.handleCommand(command)
      // Echo the request's correlation id, if it carried one — see
      // protocol.ts's `Response` doc for why awaited responses need it.
      const id = 'id' in command ? command.id : undefined
      send(id !== undefined ? { ...response, id } : response)
      if (command.cmd === 'shutdown') {
        lifecycle.dispose()
        process.exit(0)
      }
    })
    .catch((err: unknown) => {
      process.stderr.write(`audio-play: command chain error: ${err instanceof Error ? err.message : String(err)}\n`)
    })
})

// stdin closing means the parent (extension host) is gone or the pipe
// broke — drain whatever commands are already queued on the chain, then
// exit rather than lingering as an orphan holding a real audio device
// open.
rl.on('close', () => {
  lifecycle.dispose()
  void commandChain.finally(() => process.exit(0))
})

// Surface whether this connected to a real device, on stderr only (never
// stdout — stdout is exclusively the newline-JSON response channel the
// client parses line-by-line). `device: unavailable` here means zzfx's
// own import-time `new AudioContext` already hit the guarded fallback
// (see `audioContextGuard.ts`) — the process is still alive and will
// answer `ping`; only audio-touching commands will Nack.
process.stderr.write(
  `audio-play: ready (AudioContext state: ${ZZFX.audioContext.state}, device: ${
    isAudioDeviceAvailable() ? 'available' : 'unavailable'
  })\n`
)
