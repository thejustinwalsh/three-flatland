import type { Command, Response, Song } from './protocol.js'

/**
 * The audio-producing half of a command, injected so the state machine
 * below (song replacement, stop semantics) is unit-testable without a
 * real `AudioContext`/native module — `sidecar.ts` supplies the real
 * `zzfx`/`@zzfx-studio/zzfxm` implementation, tests supply a fake one.
 * `playSong` returns anything with a `.stop()` — the real implementation
 * returns an `AudioBufferSourceNode` (see `zzfxm()`'s return type), a
 * fake just needs to match that one method.
 */
export type AudioBackend = {
  play(params: number[]): void
  playSong(song: Song): { stop(): void }
}

export type CommandHandler = {
  /** Executes one command against the backend and returns the response to send. Never throws — a backend error becomes a `Nack`. */
  handleCommand(command: Command): Response
}

/**
 * The state machine `sidecar.ts` wires directly to stdin/stdout: tracks
 * at most one currently-playing song, replacing (stopping) it on a new
 * `playSong`, per the "zero fidelity drift" contract — `zzfxm()`'s song
 * and `zzfx()`'s one-shots share the backend's own `AudioContext`
 * already (see `tools/zzfx-play/CLAUDE.md`), this layer only owns *which*
 * song handle is currently live.
 */
export function createCommandHandler(backend: AudioBackend): CommandHandler {
  let currentSong: { stop(): void } | undefined

  function handleStopSong(): void {
    currentSong?.stop()
    currentSong = undefined
  }

  // Distinct from stopSong in the protocol so a future "stop everything"
  // affordance (e.g. on panel close, or a global hotkey) has a command to
  // grow into without a protocol change — one-shots are typically <1s
  // with their own release envelope and have no persistent handle to
  // interrupt today, so this is presently identical to stopSong.
  function handleStop(): void {
    handleStopSong()
  }

  function handleCommand(command: Command): Response {
    try {
      switch (command.cmd) {
        case 'play':
          backend.play(command.params)
          return { ok: true, cmd: 'play' }
        case 'playSong':
          // Replace, never stack — a new playSong stops whatever's
          // currently playing before starting the new one.
          currentSong?.stop()
          currentSong = backend.playSong(command.song)
          return { ok: true, cmd: 'playSong' }
        case 'stopSong':
          handleStopSong()
          return { ok: true, cmd: 'stopSong' }
        case 'stop':
          handleStop()
          return { ok: true, cmd: 'stop' }
        case 'shutdown':
          return { ok: true, cmd: 'shutdown' }
      }
    } catch (err) {
      return {
        ok: false,
        cmd: command.cmd,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  return { handleCommand }
}
