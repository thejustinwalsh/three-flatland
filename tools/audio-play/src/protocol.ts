/**
 * Wire protocol between the extension host (`client.ts`) and the sidecar
 * process (`sidecar.ts`) — newline-delimited JSON on stdin (commands) and
 * stdout (responses). Not JSON-RPC/LSP-framed like `@three-flatland/
 * codelens-service` — deliberately simpler, since every message here is a
 * small parameter array or song object, never a large source-file payload
 * that would need byte-precise `Content-Length` framing.
 *
 * Fire-and-forget by design for `play`/`playSong`/`stopSong`/`stop`/
 * `shutdown`: no `id`, no correlation, nothing meaningful to return
 * beyond "it started" (a failure surfaces via `client.onError`). `stats`
 * is the one exception — it exists purely to HAND BACK data (whether
 * real audio is actually reaching the output), so it needs its response
 * observed, not just its ack/nack. `client.ts`'s `getStats()` correlates
 * it by content (the next `cmd: 'stats'` line on stdout) rather than a
 * formal id — safe because the sidecar processes stdin lines strictly
 * sequentially (see `sidecar.ts`'s `rl.on('line', ...)`), so responses
 * are never reordered relative to the commands that produced them.
 */

/** A single ZzFX sound's 21 (all-optional-but-first) synth parameters. */
export type Instrument = number[]
/** One channel's step data within a pattern: `[instrument, panning, ...notes]`. */
export type Channel = number[]
/** A pattern is one "bar" across up to 4 channels. */
export type Pattern = Channel[]

/** A ZzFXM song — matches `@zzfx-studio/zzfxm`'s `zzfxm(instruments, patterns, sequence, BPM?)` shape directly. */
export type Song = {
  instruments: Instrument[]
  patterns: Pattern[]
  sequence: number[]
  bpm?: number
}

/** Optional linear gain multiplier applied on top of the sidecar's
 * master volume (`ZZFX.volume`), default 1 — the user's playback-volume
 * trim. The HOST computes it (from a dB setting, via
 * `tools/vscode/webview/audio/volumeTrim.ts`); the sidecar stays
 * mapping-agnostic and just multiplies. Sent per play (not a persistent
 * `setVolume` state) so the current setting always wins with no
 * set-then-play ordering to get wrong. */
export type PlayCommand = { cmd: 'play'; params: number[]; volume?: number }
export type PlaySongCommand = { cmd: 'playSong'; song: Song; volume?: number }
/** `path` is an ABSOLUTE path — the extension host resolves it (source
 * file's own directory, workspace root, then `public/`) before sending;
 * the sidecar never does its own path resolution. Fire-and-forget like
 * `play`/`playSong`, but the underlying decode is genuinely async — a
 * read/decode failure surfaces later via a `{ok:false, cmd:'playFile'}`
 * line on stdout, not as a rejection of this command's own (synchronous,
 * "accepted") ack. See `commandHandler.ts`'s `AudioBackend.playFile`. */
export type PlayFileCommand = { cmd: 'playFile'; path: string; volume?: number }
export type StopSongCommand = { cmd: 'stopSong' }
/** Stops everything currently audible (today: equivalent to `stopSong` — one-shots have no persistent handle to interrupt mid-flight, see commandHandler.ts). */
export type StopCommand = { cmd: 'stop' }
export type ShutdownCommand = { cmd: 'shutdown' }
/** Audibility regression guard — see `PlaybackStats`. `id` is the
 * response-correlation token (echoed back on the response) for the two
 * commands whose response a caller actually AWAITS — see `Response`'s
 * doc for why content-matching alone isn't sound once awaiters can time
 * out. Fire-and-forget commands stay id-less. */
export type StatsCommand = { cmd: 'stats'; id?: number }

/** Device-independent liveness probe — proves the sidecar PROCESS is up
 * and responding over the wire protocol WITHOUT touching `AudioContext`
 * at all: `sidecar.ts`'s `PLAY_COMMANDS` set deliberately excludes
 * `'ping'`, so it skips `contextLifecycle`'s acquire ladder entirely and
 * `commandHandler.ts` answers it without calling into the `AudioBackend`.
 * Exists so a caller (e2e process-lifecycle assertions) can prove the
 * child process is alive and responsive on a device-less runner, where
 * every audio-touching command legitimately Nacks (see
 * `tools/audio-play/AGENTS.md`'s device-tolerance section). `id`-correlated
 * like `stats`/`playToneSynth` — see `StatsCommand`'s doc for why. */
export type PingCommand = { cmd: 'ping'; id?: number }

/** The narrow, statically-parseable Tone.js instrument subset this sidecar
 * supports — see `tools/audio-play/AGENTS.md`/#47 for why Tone's imperative
 * method-chain API only gets a fixed allowlist rather than arbitrary
 * construction. `MonoSynth` is deliberately excluded — not part of the v1
 * scanner's detected shapes. */
export type ToneSynthType =
  | 'Synth'
  | 'AMSynth'
  | 'FMSynth'
  | 'DuoSynth'
  | 'MembraneSynth'
  | 'MetalSynth'
  | 'PluckSynth'
  | 'NoiseSynth'
  | 'PolySynth'

export type PlayToneSynthCommand = {
  cmd: 'playToneSynth'
  synthType: ToneSynthType
  /** `PolySynth` only — the voice class. `Tone.PolySynth()`'s own default
   * is `Synth` if omitted. Must be one of the `Monophonic`-derived types
   * (not `NoiseSynth`/`PluckSynth`/`PolySynth` itself) — the sidecar
   * backend rejects an invalid voice type with a Nack rather than letting
   * Tone's own constructor throw uncaught. */
  voiceType?: ToneSynthType
  /** Static constructor options, flat scalars only — the same "parse
   * top-level literals, skip nested objects" posture as `wad.synth`'s
   * config (see `wadSynthResolver.ts`), so this never carries a nested
   * `envelope`/`oscillator` sub-object even though Tone's real
   * constructor options do nest those. */
  config?: Record<string, number | string | boolean>
  /** Absent ONLY for `NoiseSynth` (its `triggerAttackRelease` takes no
   * note). A `string[]`/`number[]` ONLY for `PolySynth` chords — every
   * other class takes a single `string | number`. */
  note?: string | number | (string | number)[]
  duration: string | number
  volume?: number
  /** Response-correlation token, echoed on the response — see `StatsCommand.id`. */
  id?: number
}

export type WadSynthSource = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise'
export type PlayWadSynthCommand = {
  cmd: 'playWadSynth'
  config: { source: WadSynthSource } & Record<string, number | string | boolean>
  volume?: number
}

export type Command =
  | PlayCommand
  | PlaySongCommand
  | PlayFileCommand
  | StopSongCommand
  | StopCommand
  | ShutdownCommand
  | StatsCommand
  | PingCommand
  | PlayToneSynthCommand
  | PlayWadSynthCommand

/**
 * A snapshot of what the master output's `AnalyserNode` tap is seeing
 * RIGHT NOW — the regression guard for the "everything acks clean but
 * the buffer never actually reached the output" failure mode (see
 * `player.ts`'s doc comment) — plus the CURRENT SOURCE's exact timing
 * (#43): the sidecar knows precisely how long what it's playing lasts
 * (synthesized sample count ÷ sample rate for zzfx/zzfxm,
 * `AudioBuffer.duration` for decoded files), so callers derive their
 * waits from `durationSeconds` instead of guessing with magic timeouts.
 * `peak`/`silent` are meaningful only while something is actually
 * playing; query shortly after a `play`/`playSong`, while the sound's
 * release/sustain window is still open.
 */
export type PlaybackStats = {
  /** Peak absolute sample value across the analyser's current
   * time-domain window, 0..1. */
  peak: number
  /** `true` when `peak` is at-or-below floating-point noise — i.e.
   * nothing audible is actually reaching the output right now. */
  silent: boolean
  /** `true` while the most recently started source is still inside its
   * buffer's play window and hasn't been stopped (`onended` not fired,
   * elapsed < duration). `false` before anything ever played. */
  playing: boolean
  /** The current (most recently started) source's exact buffer duration
   * in seconds, playback-rate-adjusted. `0` before anything ever played —
   * it describes the source, it does not decay when playback ends. */
  durationSeconds: number
  /** Seconds since the current source started, clamped to
   * `durationSeconds`. */
  elapsedSeconds: number
  /** The shared `AudioContext`'s state AT QUERY TIME — not just at
   * startup (the sidecar's stderr ready line). A context stuck in
   * `'suspended'` is the standard Web Audio mechanism behind "plays ack
   * clean but nothing renders"; surfacing it per query lets a caller
   * distinguish a deaf context from a merely quiet analyser window.
   * (`'interrupted'` is in the spec's state set too — iOS-style device
   * preemption — so it's representable here even though macOS/Linux
   * sidecars are unlikely to ever report it.) */
  contextState: 'suspended' | 'running' | 'closed' | 'interrupted'
}

/** `id` on a response echoes the request's correlation token (see
 * `StatsCommand.id`) for the two AWAITED command kinds. Content-matching
 * "the next line of this cmd" alone is NOT sound once the awaiter can
 * time out: a merely LATE response (slow, not dropped) arriving after
 * its caller gave up would be consumed by the NEXT caller's listener,
 * shifting every subsequent same-command response one stale, permanently.
 * The echoed id makes a late orphan un-matchable. Absent on
 * fire-and-forget responses (incl. `playFile`'s async decode-failure
 * Nack, which correlates to no awaited request). */
export type Ack = { ok: true; cmd: Exclude<Command['cmd'], 'stats'>; id?: number }
/** `code` is a machine-readable tag for a specific, callers-may-need-to-
 * react-to failure mode — `'TONE_LOAD_FAILED'` (see `sidecar.ts`'s
 * `playToneSynth` backend: the lazily-loaded Tone.js engine either
 * rejected or didn't finish within its bounded timeout) and
 * `'AUDIO_DEVICE_UNAVAILABLE'` (see `audioContextGuard.ts`'s
 * `assertAudioDeviceAvailable`, thrown by every play-kind backend when
 * the native `AudioContext` never acquired a real output device). Absent
 * for every other failure; never parsed out of `error`'s message text —
 * the code IS the contract, the message is for humans. */
export type Nack = { ok: false; cmd: Command['cmd']; error: string; code?: string; id?: number }
export type StatsAck = { ok: true; cmd: 'stats'; stats: PlaybackStats; id?: number }
export type Response = Ack | Nack | StatsAck
