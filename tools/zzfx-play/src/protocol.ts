/**
 * Wire protocol between the extension host (`client.ts`) and the sidecar
 * process (`sidecar.ts`) — newline-delimited JSON on stdin (commands) and
 * stdout (responses). Not JSON-RPC/LSP-framed like `@three-flatland/
 * codelens-service` — deliberately simpler, since every message here is a
 * small parameter array or song object, never a large source-file payload
 * that would need byte-precise `Content-Length` framing.
 *
 * Fire-and-forget by design: commands carry no `id`, responses aren't
 * correlated back to a specific request. A caller that needs to know a
 * `play`/`playSong` actually started listens for an error response
 * (`client.onError`); there's nothing meaningful to return on success
 * beyond "it started."
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

export type PlayCommand = { cmd: 'play'; params: number[] }
export type PlaySongCommand = { cmd: 'playSong'; song: Song }
export type StopSongCommand = { cmd: 'stopSong' }
/** Stops everything currently audible (today: equivalent to `stopSong` — one-shots have no persistent handle to interrupt mid-flight, see sidecar.ts). */
export type StopCommand = { cmd: 'stop' }
export type ShutdownCommand = { cmd: 'shutdown' }

export type Command =
  | PlayCommand
  | PlaySongCommand
  | StopSongCommand
  | StopCommand
  | ShutdownCommand

export type Ack = { ok: true; cmd: Command['cmd'] }
export type Nack = { ok: false; cmd: Command['cmd']; error: string }
export type Response = Ack | Nack
