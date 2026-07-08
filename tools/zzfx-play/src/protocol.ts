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
 * `tools/vscode/webview/zzfx/volumeTrim.ts`); the sidecar stays
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
/** Audibility regression guard — see `PlaybackStats`. */
export type StatsCommand = { cmd: 'stats' }

export type Command =
  | PlayCommand
  | PlaySongCommand
  | PlayFileCommand
  | StopSongCommand
  | StopCommand
  | ShutdownCommand
  | StatsCommand

/**
 * A snapshot of what the master output's `AnalyserNode` tap is seeing
 * RIGHT NOW — the regression guard for the "everything acks clean but
 * the buffer never actually reached the output" failure mode (see
 * `player.ts`'s doc comment). Meaningful only while something is
 * actually playing; query it shortly after a `play`/`playSong`, while
 * the sound's release/sustain window is still open.
 */
export type PlaybackStats = {
  /** Peak absolute sample value across the analyser's current
   * time-domain window, 0..1. */
  peak: number
  /** `true` when `peak` is at-or-below floating-point noise — i.e.
   * nothing audible is actually reaching the output right now. */
  silent: boolean
}

export type Ack = { ok: true; cmd: Exclude<Command['cmd'], 'stats'> }
export type Nack = { ok: false; cmd: Command['cmd']; error: string }
export type StatsAck = { ok: true; cmd: 'stats'; stats: PlaybackStats }
export type Response = Ack | Nack | StatsAck
