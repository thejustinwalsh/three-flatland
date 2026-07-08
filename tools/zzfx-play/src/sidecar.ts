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
 * `tools/zzfx-play/CLAUDE.md` for the full prototype-gate writeup — this
 * comment is the load-bearing "why," not decoration.
 *
 * Importing the polyfill FIRST (before `zzfx`/`@zzfx-studio/zzfxm`) is
 * required: `zzfx`'s `ZZFX.audioContext = new AudioContext` runs at
 * *module load time*, so `AudioContext` must already be a real global by
 * then.
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
import 'node-web-audio-api/polyfill.js'
import * as fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import * as readline from 'node:readline'
import { ZZFX } from 'zzfx'
import { ZZFXM } from '@zzfx-studio/zzfxm'
import type { Command, Response } from './protocol.js'
import { createCommandHandler } from './commandHandler.js'
import {
  getPlaybackStats,
  playBuffer,
  playSampleChannels,
  playToneSynth,
  playWadSynth,
  type ToneEngine,
  type WadConstructor,
} from './player.js'

// Defined before `handler` — the real `playFile` backend below closes
// over this directly to report an async decode/read failure, since
// `handleCommand` has already returned its synchronous "accepted" ack by
// the time that failure is known (see `commandHandler.ts`'s
// `AudioBackend.playFile` doc comment).
function send(response: Response): void {
  process.stdout.write(`${JSON.stringify(response)}\n`)
}

// --- Tone.js: lazy, dynamic import (#47). `tone` is pure ESM (no
// synchronous CJS load path — see `loadWadConstructor` below for the
// contrast), so a genuinely lazy "only import on first use" load is
// inherently asynchronous, which collides with `AudioBackend.playToneSynth`'s
// synchronous `{stop():void}` contract. Resolved by: a cache that's
// synchronous once warm, and — on the very first `playToneSynth` command
// against a cold sidecar, before the import has resolved — a clean Nack
// ("still loading") rather than blocking `handleCommand` or crashing the
// process. The import itself is wrapped so a genuine failure (not just
// slow) Nacks the same way, never taking down zzfx/zzfxm/file playback.
let toneEngine: ToneEngine | undefined
let toneEnginePromise: Promise<ToneEngine> | undefined

function loadToneEngine(): Promise<ToneEngine> {
  if (!toneEnginePromise) {
    toneEnginePromise = import('tone').then((Tone) => {
      // Tone.Context runs a lookAhead ticker — set the real context ONCE,
      // the moment Tone is first actually needed, never per-play (a
      // fresh context per play would leak native resources).
      Tone.setContext(ZZFX.audioContext)
      const engine: ToneEngine = {
        classes: {
          Synth: Tone.Synth,
          AMSynth: Tone.AMSynth,
          FMSynth: Tone.FMSynth,
          DuoSynth: Tone.DuoSynth,
          MembraneSynth: Tone.MembraneSynth,
          MetalSynth: Tone.MetalSynth,
          PluckSynth: Tone.PluckSynth,
          NoiseSynth: Tone.NoiseSynth,
          // `Tone.PolySynth`'s real type is generic over its voice class
          // (`VoiceConstructor<Voice>`, which itself requires a static
          // `getDefaults()`) — `ToneEngine`'s simplified `voice?: unknown`
          // signature doesn't model that precision (see player.ts's
          // `ToneEngine` doc comment); this is the one point they meet.
          PolySynth: Tone.PolySynth as unknown as ToneEngine['classes']['PolySynth'],
        },
        Time: (value) => Tone.Time(value),
      }
      toneEngine = engine
      return engine
    })
  }
  return toneEnginePromise
}

// --- Wad: `web-audio-daw` is a plain CJS/UMD bundle (no `"type"` field
// in its package.json), so — unlike `tone` — a synchronous `require()`
// via `createRequire` (this file is ESM) keeps `playWadSynth`'s backend
// genuinely synchronous on every call, including the first: no cold-
// start race to Nack around. The `AudioContext`/`webkitAudioContext`
// monkey-patch MUST be in place before this very first `require()` —
// `require()` caches the module, so a second require after patching
// would be a no-op reusing whatever context the first require captured
// (verified: `tools/zzfx-play/CLAUDE.md` #47 report). The 3 additional
// shims (`document.querySelector`, no-op `window.addEventListener`/
// `removeEventListener`, `window.navigator`) are Wad's own import-time
// touches — `window.navigator` needs `Object.defineProperty`, not plain
// assignment: Node >=21 ships a built-in read-only `navigator` global.
//
// MUST patch `globalThis.window.AudioContext`/`.webkitAudioContext`, NOT
// just the bare `globalThis.AudioContext`/`globalThis.webkitAudioContext`
// — `node-web-audio-api/polyfill.js` creates `globalThis.window` as a
// SEPARATE plain object (`globalThis.window = {}`, then copies each
// export onto it once) rather than aliasing it to `globalThis` itself, so
// `globalThis.window !== globalThis`. `web-audio-daw`'s own
// `src/common.js` reads `window.AudioContext || window.webkitAudioContext`
// (confirmed against the installed `web-audio-daw@4.13.4` bundle source)
// — patching only the bare globals left `window.AudioContext` pointing at
// its ORIGINAL real-context snapshot the whole time, so every `new
// Wad(...)` silently built its OWN, genuinely separate, second real
// `AudioContext` instead of adopting `ZZFX.audioContext`. That produced a
// real, always-reproducing bug: every `wad.play()` threw "Attempting to
// connect nodes from different contexts" (a native Web Audio
// InvalidAccessError) the moment `plugEmIn` tried to connect Wad's own
// internal chain to `player.ts`'s shared `gainNode` — caught by
// `commandHandler.ts`'s try/catch into a silent Nack no caller observed,
// so wad.synth playback never actually reached the output at all. Prior
// e2e coverage never caught this because it polled the SHARED analyser
// for "is anything audible," which could read `true` from an adjacent,
// still-fading-out sound from a preceding command — never proof that
// wad.synth's OWN sound was what it heard.
let wadCtor: WadConstructor | undefined

function loadWadConstructor(): WadConstructor {
  if (wadCtor) return wadCtor

  const realAudioContext = globalThis.AudioContext
  const realWebkitAudioContext = (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext
  const realWindowAudioContext = globalThis.window.AudioContext
  const realWindowWebkitAudioContext = (globalThis.window as { webkitAudioContext?: unknown })
    .webkitAudioContext
  // The explicit-object-return `new` trick: a constructor that returns
  // an object explicitly makes `new Ctor()` use that object instead of
  // the newly allocated one — Wad has no constructor-injection point for
  // its `AudioContext`, so this is the only way to make it adopt ours.
  function FakeAudioContext(): AudioContext {
    return ZZFX.audioContext
  }

  globalThis.document ??= { querySelector: () => null } as unknown as Document
  globalThis.window.addEventListener ??= () => {}
  globalThis.window.removeEventListener ??= () => {}
  Object.defineProperty(globalThis.window, 'navigator', {
    value: {},
    configurable: true,
    writable: true,
  })
  globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext
  ;(globalThis as { webkitAudioContext?: unknown }).webkitAudioContext = FakeAudioContext
  globalThis.window.AudioContext = FakeAudioContext as unknown as typeof AudioContext
  ;(globalThis.window as { webkitAudioContext?: unknown }).webkitAudioContext = FakeAudioContext

  const require = createRequire(import.meta.url)
  wadCtor = require('web-audio-daw') as WadConstructor

  // Restore the real constructors for hygiene — Wad's own module-scope
  // `context` reference is already captured permanently by this point
  // (its bundle reads `window.AudioContext` once, at its own
  // module-load time), so this isn't load-bearing, just avoids leaving
  // a surprising global patch in place for any unrelated future code.
  globalThis.AudioContext = realAudioContext
  ;(globalThis as { webkitAudioContext?: unknown }).webkitAudioContext = realWebkitAudioContext
  globalThis.window.AudioContext = realWindowAudioContext
  ;(globalThis.window as { webkitAudioContext?: unknown }).webkitAudioContext =
    realWindowWebkitAudioContext

  return wadCtor
}

const handler = createCommandHandler({
  // `volume` is the wire command's user-trim multiplier (handler defaults
  // it to 1) — applied on top of ZZFX.volume so 1 is byte-for-byte
  // today's baseline loudness.
  play: (params, volume) => {
    playSampleChannels(
      ZZFX.audioContext,
      [ZZFX.buildSamples(...params)],
      ZZFX.sampleRate,
      ZZFX.volume * volume
    )
  },
  playSong: (song, volume) =>
    playSampleChannels(
      ZZFX.audioContext,
      ZZFXM.build(song.instruments, song.patterns, song.sequence, song.bpm),
      ZZFX.sampleRate,
      ZZFX.volume * volume
    ),
  // Fire-and-forget: `fs.readFile` + `decodeAudioData` are both async,
  // but `handleCommand` (and the `rl.on('line', ...)` loop it runs
  // inside) must never block on them — see `tools/zzfx-play/CLAUDE.md`'s
  // "the async wrinkle". A read/decode failure is reported directly via
  // `send`, not thrown — there is no longer a live `handleCommand` call
  // stack to throw into by the time this `catch` runs. `onStarted` hands
  // the started source back to the command handler so the file becomes
  // the current STOPPABLE source (#46) — the handler's generation guard
  // owns the "decode landed after a newer play" race.
  playFile: (filePath, volume, onStarted) => {
    void (async () => {
      try {
        const bytes = await fs.readFile(filePath)
        const arrayBuffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        )
        const audioBuffer = await ZZFX.audioContext.decodeAudioData(arrayBuffer)
        onStarted(playBuffer(ZZFX.audioContext, audioBuffer, ZZFX.volume * volume))
      } catch (err) {
        send({
          ok: false,
          cmd: 'playFile',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })()
  },
  playToneSynth: (cmd, volume) => {
    if (!toneEngine) {
      // Kick off the load (idempotent — see loadToneEngine's cache) and
      // Nack this attempt rather than blocking handleCommand on an
      // inherently-async dynamic import. A genuine import failure lands
      // here too, on stderr only — never crashes the sidecar.
      void loadToneEngine().catch((err) => {
        process.stderr.write(
          `zzfx-play: tone failed to load: ${err instanceof Error ? err.message : String(err)}\n`
        )
      })
      throw Object.assign(new Error('Tone.js is still loading — try again in a moment'), {
        code: 'TONE_LOADING',
      })
    }
    return playToneSynth(ZZFX.audioContext, toneEngine, cmd, ZZFX.volume * volume)
  },
  playWadSynth: (config, volume) => {
    const WadCtor = loadWadConstructor()
    return playWadSynth(ZZFX.audioContext, WadCtor, config, ZZFX.volume * volume)
  },
  getStats: () => getPlaybackStats(ZZFX.audioContext),
})

const rl = readline.createInterface({ input: process.stdin })

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return

  let command: Command
  try {
    command = JSON.parse(trimmed) as Command
  } catch (err) {
    process.stderr.write(
      `zzfx-play: malformed command (not JSON): ${trimmed} (${err instanceof Error ? err.message : String(err)})\n`
    )
    return
  }

  const response = handler.handleCommand(command)
  send(response)
  if (command.cmd === 'shutdown') process.exit(0)
})

// stdin closing means the parent (extension host) is gone or the pipe
// broke — exit rather than lingering as an orphan holding a real audio
// device open.
rl.on('close', () => {
  process.exit(0)
})

// Surface that this connected to a real device, on stderr only (never
// stdout — stdout is exclusively the newline-JSON response channel the
// client parses line-by-line).
process.stderr.write(`zzfx-play: ready (AudioContext state: ${ZZFX.audioContext.state})\n`)
