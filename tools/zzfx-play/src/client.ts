import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import * as readline from 'node:readline'
import type {
  Command,
  Nack,
  PlaybackStats,
  PlayToneSynthCommand,
  PlayWadSynthCommand,
  Response,
  Song,
  StatsAck,
} from './protocol.js'

export type PlaySidecarOptions = {
  /** `process.execPath`, read from *inside* the extension host — see `sidecar.ts`'s header comment for why this must come from there, not be computed independently. */
  execPath: string
  /** Absolute path to the built `sidecar.js` entry point. */
  sidecarPath: string
  env?: NodeJS.ProcessEnv
}

/**
 * Spawns and talks to the zzfx-play sidecar. Lifecycle mirrors `tools/
 * vscode/extension/tools/zzfx/sidecarManager.ts`'s pattern for the
 * codelens-service client: lazy spawn on first use, warm reuse for
 * everything after, explicit `shutdown()` on extension deactivate.
 * `play`/`playSong` both call `start()` internally, so a caller never
 * needs to sequence "spawn, then play" itself.
 */
export class PlaySidecarClient {
  private child: ChildProcessWithoutNullStreams | undefined
  private rl: readline.Interface | undefined
  private readonly exitListeners = new Set<
    (code: number | null, signal: NodeJS.Signals | null) => void
  >()
  private readonly errorListeners = new Set<(err: Error) => void>()

  constructor(private readonly options: PlaySidecarOptions) {}

  get isRunning(): boolean {
    return !!this.child && this.child.exitCode === null && !this.child.killed
  }

  /** The running sidecar's OS process id, or `undefined` if not started. */
  get pid(): number | undefined {
    return this.child?.pid
  }

  /** Spawns the sidecar if it isn't already running. Safe to call repeatedly — a no-op once warm. */
  start(): void {
    if (this.child) return

    const child = spawn(this.options.execPath, [this.options.sidecarPath], {
      env: { ...(this.options.env ?? process.env), ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child

    this.rl = readline.createInterface({ input: child.stdout })
    this.rl.on('line', (line) => {
      let response: Response
      try {
        response = JSON.parse(line) as Response
      } catch {
        return
      }
      if (!response.ok) {
        // `response.code` (e.g. `'TONE_LOADING'`) rides along on the
        // emitted Error as a `.code` property, not parsed back out of the
        // message — lets a caller (register.ts's cold-start retry)
        // correlate a specific failure mode without a formal request id.
        this.emitError(
          Object.assign(new Error(`zzfx-play: ${response.cmd} failed: ${response.error}`), {
            ...(response.code !== undefined ? { code: response.code } : {}),
          })
        )
      }
    })

    child.on('exit', (code, signal) => {
      this.child = undefined
      this.rl?.close()
      this.rl = undefined
      for (const listener of this.exitListeners) listener(code, signal)
    })
    child.on('error', (err) => this.emitError(err))
  }

  private emitError(err: Error): void {
    for (const listener of this.errorListeners) listener(err)
  }

  private send(command: Command): void {
    this.start()
    if (!this.child || this.child.stdin.destroyed) {
      throw new Error('zzfx-play: sidecar is not running')
    }
    this.child.stdin.write(`${JSON.stringify(command)}\n`)
  }

  /** Plays a one-shot zzfx sound. Spawns the sidecar on first call.
   * `volume` is the optional user-trim gain multiplier (see
   * `PlayCommand.volume`); omitted = the untouched baseline loudness. */
  play(params: number[], volume?: number): void {
    this.send({ cmd: 'play', params, ...(volume !== undefined ? { volume } : {}) })
  }

  /** Plays a ZzFXM song, replacing whatever song is currently playing. Spawns the sidecar on first call. */
  playSong(song: Song, volume?: number): void {
    this.send({ cmd: 'playSong', song, ...(volume !== undefined ? { volume } : {}) })
  }

  /** Plays an audio file by ABSOLUTE path (the caller resolves it — see
   * `PlayFileCommand`). Spawns the sidecar on first call, mirroring
   * `play`/`playSong`. A read/decode failure surfaces asynchronously via
   * `onError`, not as a rejection of this call. */
  playFile(path: string, volume?: number): void {
    this.send({ cmd: 'playFile', path, ...(volume !== undefined ? { volume } : {}) })
  }

  /** Plays a Tone.js instrument finding (#47). Spawns the sidecar on
   * first call, mirroring `play`/`playSong`. */
  playToneSynth(cmd: Omit<PlayToneSynthCommand, 'cmd'>, volume?: number): void {
    this.send({
      cmd: 'playToneSynth',
      ...cmd,
      ...(volume !== undefined ? { volume } : {}),
    })
  }

  /** Plays a Wad oscillator/noise synth finding (#47). Spawns the
   * sidecar on first call, mirroring `play`/`playSong`. */
  playWadSynth(config: PlayWadSynthCommand['config'], volume?: number): void {
    this.send({ cmd: 'playWadSynth', config, ...(volume !== undefined ? { volume } : {}) })
  }

  /** Stops the current stoppable source — a song or a decoded file (#46)
   * — if any. No-op if the sidecar isn't running. */
  stopSong(): void {
    if (!this.isRunning) return
    this.send({ cmd: 'stopSong' })
  }

  /** Stops everything currently audible. No-op if the sidecar isn't running. */
  stop(): void {
    if (!this.isRunning) return
    this.send({ cmd: 'stop' })
  }

  /** Serializes `getStats` callers — see its doc comment for why
   * content-based correlation makes overlap unsafe. */
  private statsChain: Promise<unknown> = Promise.resolve()

  /**
   * Queries the master output's `AnalyserNode` tap for real-time
   * audibility — the regression guard for the "acks clean but never
   * actually reaches the output" failure mode (see `protocol.ts`'s
   * `PlaybackStats`). Spawns the sidecar on first call, like `play`/
   * `playSong`. Unlike every other command here, `stats` genuinely needs
   * its response observed rather than just its ack/nack, so this attaches
   * a dedicated, self-removing `line` listener *before* sending — see
   * `protocol.ts`'s doc comment for why content-filtering (the next
   * `cmd: 'stats'` line) is a safe way to correlate it without a formal
   * request id.
   *
   * That correlation is only safe for ONE in-flight query at a time, so
   * concurrent callers are SERIALIZED (#46): with two outstanding, both
   * listeners resolve on the first response line and the second response
   * arrives orphaned — to be swallowed by whichever query attaches next,
   * leaving every later caller one full response STALE. With #46's
   * auto-revert watcher polling in the background alongside e2e polls,
   * that staleness (~a poll period) is wider than a short one-shot's
   * entire audible window — a real, observed miss, not a theoretical one.
   */
  async getStats(): Promise<PlaybackStats> {
    // statsChain is always the caught tail, so it never rejects — one
    // fulfillment handler is enough, and one failed query can't poison
    // the queue for the callers behind it.
    const run = this.statsChain.then(() => this.requestStats())
    this.statsChain = run.catch(() => undefined)
    return run
  }

  private async requestStats(): Promise<PlaybackStats> {
    this.start()
    if (!this.rl) {
      throw new Error('zzfx-play: sidecar is not running')
    }
    const rl = this.rl

    const responsePromise = new Promise<Nack | StatsAck>((resolve) => {
      const onLine = (line: string): void => {
        let parsed: Response
        try {
          parsed = JSON.parse(line) as Response
        } catch {
          return
        }
        if (parsed.cmd !== 'stats') return
        rl.off('line', onLine)
        resolve(parsed)
      }
      rl.on('line', onLine)
    })

    this.send({ cmd: 'stats' })
    const response = await responsePromise
    if (!response.ok) {
      throw new Error(`zzfx-play: stats failed: ${response.error}`)
    }
    return response.stats
  }

  /** Graceful shutdown: sends `shutdown`, waits for real process exit, SIGKILLs after `timeoutMs` if it doesn't. No-op if never started. */
  async shutdown(timeoutMs = 3000): Promise<void> {
    const child = this.child
    if (!child) return

    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve())
    })
    try {
      this.send({ cmd: 'shutdown' })
    } catch {
      // Already gone — exited promise below resolves immediately.
    }

    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), timeoutMs)),
    ])
    if (timedOut && this.child === child) {
      child.kill('SIGKILL')
      await exited
    }
  }

  /** Hard kill, no handshake, no timeout. */
  dispose(): void {
    this.child?.kill('SIGKILL')
    this.child = undefined
  }

  /** Returns an unsubscribe function — same convention as `tools/bridge`'s `ClientBridge.on()`. */
  onExit(listener: (code: number | null, signal: NodeJS.Signals | null) => void): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  /** Returns an unsubscribe function. */
  onError(listener: (err: Error) => void): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }
}
