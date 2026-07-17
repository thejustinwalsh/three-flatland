import type { Command, PlaybackStats, PlayToneSynthCommand, PlayWadSynthCommand, Response, Song } from './protocol.js'

/**
 * The audio-producing half of a command, injected so the state machine
 * below (song replacement, stop semantics) is unit-testable without a
 * real `AudioContext`/native module — `sidecar.ts` supplies the real
 * `zzfx`/`@zzfx-studio/zzfxm` implementation, tests supply a fake one.
 * `playSong` returns anything with a `.stop()` — the real implementation
 * returns an `AudioBufferSourceNode` (see `zzfxm()`'s return type), a
 * fake just needs to match that one method. `getStats` is the
 * audibility regression guard (see `protocol.ts`'s `PlaybackStats`) —
 * synchronous because it's just reading whatever the analyser tap
 * currently sees, no async work involved.
 */
export type AudioBackend = {
  /** `volume` is the wire command's gain multiplier, already defaulted to 1 by the handler. */
  play(params: number[], volume: number): void
  playSong(song: Song, volume: number): { stop(): void }
  /**
   * Fire-and-forget: kicks off an async read+decode+play and returns
   * immediately — `handleCommand` acks "accepted" synchronously right
   * after this returns, since decoding is inherently async and the
   * stdin/stdout wiring must never block waiting for it (see
   * `tools/audio-play/CLAUDE.md`'s "the async wrinkle"). A read/decode
   * failure is the implementation's own responsibility to report through
   * whatever async channel it has — the real `sidecar.ts` backend
   * reports it via a `{ok:false, cmd:'playFile'}` line on stdout, closing
   * directly over `send` rather than routing back through this
   * synchronous return value, since there is no longer a live caller by
   * the time an async failure is known.
   *
   * `onStarted` (#46) hands the decoded-and-started source's stop handle
   * back once the async decode completes — the handler's only window
   * into making a file the current STOPPABLE source (see `handleCommand`'s
   * generation guard for how a late decode is prevented from resurrecting
   * a superseded play). Never called on a read/decode failure.
   */
  playFile(path: string, volume: number, onStarted: (handle: { stop(): void }) => void): void
  /**
   * Construction, like `playSong` — but MAY be asynchronous, unlike
   * `playSong`/`playWadSynth`: the real `sidecar.ts` backend awaits the
   * lazily-loaded Tone.js engine (bounded — see `loadToneEngineBounded`)
   * before constructing the synth, so the command's own Ack/Nack reflects
   * whether the engine actually became ready, not just "accepted." A
   * fake/test backend may still return synchronously — `handleCommand`
   * awaits either shape.
   */
  playToneSynth(cmd: Omit<PlayToneSynthCommand, 'cmd'>, volume: number): { stop(): void } | Promise<{ stop(): void }>
  playWadSynth(config: PlayWadSynthCommand['config'], volume: number): { stop(): void }
  getStats(): PlaybackStats
}

export type CommandHandler = {
  /**
   * Executes one command against the backend and returns the response to
   * send. Never throws — a backend error becomes a `Nack`. Always
   * returns a Promise — most commands settle on the same microtask, but
   * `playToneSynth`'s backend call can genuinely await (see
   * `AudioBackend.playToneSynth`'s doc comment), and a single async
   * function is simpler than a per-command sync/async split for the one
   * branch that needs it.
   */
  handleCommand(command: Command): Promise<Response>
}

/**
 * The state machine `sidecar.ts` wires directly to stdin/stdout: tracks
 * at most one currently-playing stoppable source — a song OR a decoded
 * file (#46) — replacing (stopping) it on any new `playSong`/`playFile`,
 * per the "zero fidelity drift" contract — `zzfxm()`'s song and
 * `zzfx()`'s one-shots share the backend's own `AudioContext` already
 * (see `tools/audio-play/CLAUDE.md`), this layer only owns *which* source
 * handle is currently live.
 */
export function createCommandHandler(backend: AudioBackend): CommandHandler {
  let currentSource: { stop(): void } | undefined
  // Bumped by every command that changes what "current" means. A
  // playFile's decode completes asynchronously — if anything newer
  // happened in between (another play, an explicit stop), the late
  // source must be stopped on arrival, not registered (or worse,
  // layered) — see the onStarted callback in handlePlayFile.
  let playGeneration = 0

  function replaceCurrentSource(): void {
    playGeneration++
    // Clear the field BEFORE calling stop(), not after: if the caller's
    // subsequent backend call throws, leaving currentSource pointing at
    // the just-stopped handle means a later stopSong/stop calls .stop()
    // on it a second time.
    const old = currentSource
    currentSource = undefined
    try {
      old?.stop()
    } catch {
      // A STALE handle's stop() may throw (its source's context was
      // closed underneath it — reachable via the context lifecycle's
      // idle-release/reacquire). The old source is dead either way;
      // propagating would Nack a NEW play that already succeeded and
      // skip adopting its handle, leaving it unstoppable.
    }
  }

  // Try-then-replace: call the backend FIRST, and only stop the old
  // source + adopt the new handle once the backend call has actually
  // succeeded (awaited to completion for playToneSynth — see
  // handleCommand's playToneSynth case). A throwing/rejecting backend
  // call must never have side effects on whatever is currently playing.
  function playAndReplace(next: { stop(): void }): void {
    replaceCurrentSource()
    currentSource = next
  }

  // Distinct from stopSong in the protocol so a future "stop everything"
  // affordance (e.g. on panel close, or a global hotkey) has a command to
  // grow into without a protocol change — one-shots are typically <1s
  // with their own release envelope and have no persistent handle to
  // interrupt today, so this is presently identical to stopSong.
  function handleStop(): void {
    replaceCurrentSource()
  }

  async function handleCommand(command: Command): Promise<Response> {
    try {
      switch (command.cmd) {
        case 'play':
          backend.play(command.params, command.volume ?? 1)
          return { ok: true, cmd: 'play' }
        case 'playSong': {
          // Replace, never stack — a new playSong stops whatever's
          // currently playing before starting the new one.
          playAndReplace(backend.playSong(command.song, command.volume ?? 1))
          return { ok: true, cmd: 'playSong' }
        }
        case 'playFile': {
          replaceCurrentSource()
          const generation = playGeneration
          backend.playFile(command.path, command.volume ?? 1, (handle) => {
            // Still the newest play when the decode landed → this source
            // is the current stoppable one (#46). Superseded → it just
            // started playing over whatever replaced it; stop it now.
            if (generation === playGeneration) currentSource = handle
            else handle.stop()
          })
          return { ok: true, cmd: 'playFile' }
        }
        case 'playToneSynth': {
          // Awaited BEFORE playAndReplace touches the current source — a
          // backend that rejects (engine never became ready) must never
          // stop whatever's currently playing, same try-then-replace
          // contract every other play kind gets (see playAndReplace's own
          // doc comment).
          const handle = await backend.playToneSynth(command, command.volume ?? 1)
          playAndReplace(handle)
          return { ok: true, cmd: 'playToneSynth' }
        }
        case 'playWadSynth': {
          playAndReplace(backend.playWadSynth(command.config, command.volume ?? 1))
          return { ok: true, cmd: 'playWadSynth' }
        }
        case 'stopSong':
          replaceCurrentSource()
          return { ok: true, cmd: 'stopSong' }
        case 'stop':
          handleStop()
          return { ok: true, cmd: 'stop' }
        case 'shutdown':
          return { ok: true, cmd: 'shutdown' }
        case 'stats':
          return { ok: true, cmd: 'stats', stats: backend.getStats() }
        // Device-independent liveness probe — deliberately never touches
        // `backend` (see protocol.ts's `PingCommand` doc). Answered here,
        // not delegated, so it stays true regardless of what the real
        // `sidecar.ts` backend's AudioContext is doing.
        case 'ping':
          return { ok: true, cmd: 'ping' }
      }
    } catch (err) {
      // Generic — never special-cased to a particular backend method. Any
      // thrown/rejected error carrying a `.code` (e.g. playToneSynth's
      // TONE_LOAD_FAILED or AUDIO_DEVICE_UNAVAILABLE, see sidecar.ts)
      // propagates it onto the Nack; every other failure just omits the
      // field. `await` inside the `try` above funnels a rejected
      // `backend.playToneSynth(...)` promise through this same path —
      // no separate async error channel needed.
      const code = err instanceof Error && 'code' in err ? String((err as { code?: unknown }).code) : undefined
      return {
        ok: false,
        cmd: command.cmd,
        error: err instanceof Error ? err.message : String(err),
        ...(code !== undefined ? { code } : {}),
      }
    }
  }

  return { handleCommand }
}
