import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import * as readline from 'node:readline'
import type {
  Ack,
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

/** Thrown by `start()` (and anything that calls it internally — `play()`,
 * `getStats()`, etc.) once a `PlaySidecarClient` instance's process has
 * exited even once. An exited instance never respawns itself — the
 * singleton owner (`playSidecarManager.ts`) hands out a brand NEW instance
 * on the next `getPlaySidecarClient()` call instead. See `start()`'s doc
 * comment for why silently respawning from a stale instance is unsafe. */
export class PlaySidecarExitedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlaySidecarExitedError'
  }
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
  private exited = false

  constructor(private readonly options: PlaySidecarOptions) {}

  get isRunning(): boolean {
    return !!this.child && this.child.exitCode === null && !this.child.killed
  }

  /** True once this instance's process has exited (cleanly or otherwise) —
   * permanent for the instance's lifetime, mirrors `@three-flatland/
   * codelens-service`'s `CodelensServiceClient.isExited`. */
  get isExited(): boolean {
    return this.exited
  }

  /** The running sidecar's OS process id, or `undefined` if not started. */
  get pid(): number | undefined {
    return this.child?.pid
  }

  /**
   * Spawns the sidecar if it isn't already running. Safe to call
   * repeatedly — a no-op once warm. Throws `PlaySidecarExitedError` once
   * this instance's process has exited even once — it never silently
   * respawns a NEW child from an exited instance. That matters because a
   * caller can hold onto a `PlaySidecarClient` reference across the
   * process's exit (e.g. `activePlayback.ts`'s `watchPlaybackEnd` polling
   * loop, captured once per play and outliving a crash+respawn of the
   * SINGLETON in `playSidecarManager.ts`); without this guard, the next
   * poll's `getStats()` → `start()` on that stale instance would silently
   * spawn a second, orphaned child process — invisible to the singleton's
   * own pid/shutdown bookkeeping. Get a fresh instance from
   * `getPlaySidecarClient()` instead of reusing an exited one.
   */
  start(): void {
    if (this.exited) {
      throw new PlaySidecarExitedError('zzfx-play: this sidecar instance has already exited')
    }
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
      this.exited = true
      this.child = undefined
      this.rl?.close()
      this.rl = undefined
      for (const listener of this.exitListeners) listener(code, signal)
    })
    child.on('error', (err) => {
      // A spawn failure doesn't reliably guarantee a following 'exit'
      // event across every failure mode — `exited` must be set here
      // directly (same reasoning as CodelensServiceClient's identical
      // comment) or this instance could stay silently un-guarded forever.
      this.exited = true
      this.emitError(err)
    })
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
   * first call, mirroring `play`/`playSong`. Fire-and-forget — a failure
   * surfaces only via `onError`. See {@link playToneSynthAwaitable} for a
   * variant that awaits THIS call's own correlated response. */
  playToneSynth(cmd: Omit<PlayToneSynthCommand, 'cmd'>, volume?: number): void {
    this.send({
      cmd: 'playToneSynth',
      ...cmd,
      ...(volume !== undefined ? { volume } : {}),
    })
  }

  /** Serializes `playToneSynthAwaitable` callers — same reasoning as
   * `getStats`'s `statsChain`: content-based correlation (the next
   * `cmd: 'playToneSynth'` response line) is only safe for one in-flight
   * call at a time. Independent of `statsChain` — the two command kinds
   * never share a queue. */
  private toneSynthChain: Promise<unknown> = Promise.resolve()

  /**
   * Correlated variant of {@link playToneSynth} (toneColdStartRetry.ts's
   * cold-start retry, #47/#49) — awaits THIS SPECIFIC call's own Ack/Nack
   * response, rather than a caller inferring success from
   * `getStats().playing`, which reflects the whole context's shared
   * "most-recently-started source" record and can read `true` off an
   * unrelated, still-audible one-shot that has nothing to do with this
   * call. Safe (not a race against the sidecar's own cold-spawn time, no
   * timeout window) because the sidecar processes stdin strictly
   * sequentially (see `protocol.ts`'s doc comment): attaching a listener
   * for the next `cmd: 'playToneSynth'` response line, before sending,
   * always resolves with THIS call's own response, however long the
   * sidecar takes to produce it.
   *
   * Concurrent callers are SERIALIZED via `toneSynthChain`, same
   * reasoning (and same known one-in-flight limitation) as `getStats`.
   */
  async playToneSynthAwaitable(
    cmd: Omit<PlayToneSynthCommand, 'cmd'>,
    volume?: number
  ): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
    const run = this.toneSynthChain.then(() => this.requestPlayToneSynth(cmd, volume))
    this.toneSynthChain = run.catch(() => undefined)
    return run
  }

  private async requestPlayToneSynth(
    cmd: Omit<PlayToneSynthCommand, 'cmd'>,
    volume?: number
  ): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
    this.start()
    if (!this.rl) {
      throw new Error('zzfx-play: sidecar is not running')
    }
    const rl = this.rl

    const responsePromise = new Promise<Nack | Ack>((resolve) => {
      const onLine = (line: string): void => {
        let parsed: Response
        try {
          parsed = JSON.parse(line) as Response
        } catch {
          return
        }
        if (parsed.cmd !== 'playToneSynth') return
        rl.off('line', onLine)
        resolve(parsed)
      }
      rl.on('line', onLine)
    })

    this.send({
      cmd: 'playToneSynth',
      ...cmd,
      ...(volume !== undefined ? { volume } : {}),
    })
    const response = await responsePromise
    if (!response.ok) {
      return {
        ok: false,
        error: response.error,
        ...(response.code !== undefined ? { code: response.code } : {}),
      }
    }
    return { ok: true }
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
