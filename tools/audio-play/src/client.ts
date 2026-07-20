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
 * Spawns and talks to the audio-play sidecar. Lifecycle mirrors `tools/
 * vscode/extension/tools/audio/sidecarManager.ts`'s pattern for the
 * codelens-service client: lazy spawn on first use, warm reuse for
 * everything after, explicit `shutdown()` on extension deactivate.
 * `play`/`playSong` both call `start()` internally, so a caller never
 * needs to sequence "spawn, then play" itself.
 */
export class PlaySidecarClient {
  private child: ChildProcessWithoutNullStreams | undefined
  private rl: readline.Interface | undefined
  private stderrRl: readline.Interface | undefined
  private readonly exitListeners = new Set<(code: number | null, signal: NodeJS.Signals | null) => void>()
  private readonly errorListeners = new Set<(err: Error) => void>()
  private readonly stderrListeners = new Set<(line: string) => void>()
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
      throw new PlaySidecarExitedError('audio-play: this sidecar instance has already exited')
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
        // `response.code` (e.g. `'AUDIO_DEVICE_UNAVAILABLE'`, or
        // `'TONE_LOAD_FAILED'` for a fire-and-forget `playToneSynth()`
        // call — see {@link playToneSynthAwaitable} for the correlated
        // variant callers should prefer) rides along on the emitted Error
        // as a `.code` property, not parsed back out of the message —
        // lets a listener react to a specific failure mode without a
        // formal request id.
        this.emitError(
          Object.assign(
            new Error(`audio-play: ${response.cmd} failed: ${response.error}`),
            response.code !== undefined ? { code: response.code } : {}
          )
        )
      }
    })

    // The sidecar's stderr is its only out-of-band diagnostic channel —
    // the ready line (with AudioContext state), resume()/state-change
    // logs, native module load errors. This listener lives HERE, not on a
    // `client.stderr` accessor the owner wires up (codelens-service's
    // pattern), because this client spawns lazily: at creation time there
    // is no child yet for an owner to attach to, and the first lines
    // (spawn crash stack, the ready line) land before any post-hoc attach
    // could. Forwarded per line via `onStderr`.
    this.stderrRl = readline.createInterface({ input: child.stderr })
    this.stderrRl.on('line', (line) => {
      for (const listener of this.stderrListeners) listener(line)
    })

    child.on('exit', (code, signal) => {
      this.exited = true
      this.child = undefined
      this.rl?.close()
      this.rl = undefined
      this.stderrRl?.close()
      this.stderrRl = undefined
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
      throw new Error('audio-play: sidecar is not running')
    }
    this.child.stdin.write(`${JSON.stringify(command)}\n`)
  }

  /** Correlation tokens for awaited requests (`stats`/`playToneSynth`) —
   * monotonic per instance; the sidecar echoes them back (protocol.ts). */
  private nextRequestId = 1

  /**
   * Resolves with the response line matching `cmd` AND `id` (the
   * sidecar's echo of this request's own correlation token), or REJECTS
   * after `timeoutMs`. The timeout is the escape hatch for a response
   * that never arrives at all: without it, an unsettled promise here
   * wedges the caller's serialization chain (`statsChain`/
   * `toneSynthChain`) permanently, starving every later caller for the
   * instance's whole lifetime (observed for real: one lost first-ever
   * stats response early in an e2e session failed every stats poll in
   * the entire run).
   *
   * The id match is what makes the timeout SAFE: matching on cmd alone,
   * a merely LATE response (slow, not dropped) arriving after its
   * caller's timeout would be consumed by the NEXT caller's listener —
   * shifting every subsequent same-command response one stale, forever.
   * With ids, a late orphan matches no waiter and falls through
   * harmlessly.
   */
  private waitForResponse<R extends Response>(
    rl: readline.Interface,
    cmd: Command['cmd'],
    id: number,
    timeoutMs: number
  ): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const onLine = (line: string): void => {
        let parsed: Response
        try {
          parsed = JSON.parse(line) as Response
        } catch {
          return
        }
        if (parsed.cmd !== cmd || parsed.id !== id) return
        cleanup()
        resolve(parsed as R)
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`audio-play: no ${cmd} response within ${timeoutMs}ms`))
      }, timeoutMs)
      const cleanup = (): void => {
        clearTimeout(timer)
        rl.off('line', onLine)
      }
      rl.on('line', onLine)
    })
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
   * Correlated variant of {@link playToneSynth} (#47/#49) — awaits THIS
   * SPECIFIC call's own Ack/Nack response, rather than a caller inferring
   * success from `getStats().playing`, which reflects the whole context's
   * shared "most-recently-started source" record and can read `true` off
   * an unrelated, still-audible one-shot that has nothing to do with this
   * call. Not a race against the sidecar's own cold-spawn time, because
   * the sidecar processes stdin strictly sequentially (see `protocol.ts`'s
   * doc comment): attaching a listener for the next `cmd: 'playToneSynth'`
   * response line, before sending, always pairs with THIS call's own
   * response, however long the sidecar takes to produce it.
   *
   * The sidecar's own `playToneSynth` backend awaits its lazily-loaded
   * Tone.js engine (bounded, `TONE_LOAD_TIMEOUT_MS` in `sidecar.ts`)
   * before Acking/Nacking, so this call's own round trip can legitimately
   * take that long on a cold sidecar's first Tone play — the caller
   * (`register.ts`) awaits this ONE response directly rather than
   * retrying on a fixed schedule; `timeoutMs`'s default below leaves
   * headroom above the sidecar's own bound so it only fires as an outer
   * safety net (a dropped response, a wedged sidecar), never in the
   * normal bounded-wait path.
   *
   * Concurrent callers are SERIALIZED via `toneSynthChain`, same
   * reasoning (and same known one-in-flight limitation) as `getStats`.
   * A response that never arrives at all rejects after `timeoutMs`
   * instead of wedging the chain forever — see `waitForResponse`.
   */
  async playToneSynthAwaitable(
    cmd: Omit<PlayToneSynthCommand, 'cmd'>,
    volume?: number,
    timeoutMs = 15_000
  ): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
    const run = this.toneSynthChain.then(() => this.requestPlayToneSynth(cmd, volume, timeoutMs))
    this.toneSynthChain = run.catch(() => undefined)
    return run
  }

  private async requestPlayToneSynth(
    cmd: Omit<PlayToneSynthCommand, 'cmd'>,
    volume: number | undefined,
    timeoutMs: number
  ): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
    this.start()
    if (!this.rl) {
      throw new Error('audio-play: sidecar is not running')
    }

    const id = this.nextRequestId++
    const responsePromise = this.waitForResponse<Nack | Ack>(this.rl, 'playToneSynth', id, timeoutMs)
    this.send({
      cmd: 'playToneSynth',
      ...cmd,
      ...(volume !== undefined ? { volume } : {}),
      // Last, so a caller-supplied `id` riding in on `cmd` can never
      // desynchronize the correlation.
      id,
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

  /** Serializes `ping` callers — same one-in-flight reasoning as
   * `statsChain`/`toneSynthChain` below (the id is what makes overlap
   * correlation-safe; the queue keeps response ordering trivial to
   * reason about regardless). Independent of the other two chains — the
   * three command kinds never share a queue. */
  private pingChain: Promise<unknown> = Promise.resolve()

  /**
   * Device-independent liveness probe (id-correlated like `stats`/
   * `playToneSynth`) — resolves `true` once the sidecar PROCESS has
   * echoed THIS SPECIFIC `ping` back over the wire protocol, proving
   * it's alive and responsive WITHOUT needing a working audio backend:
   * `ping` never appears in `sidecar.ts`'s `PLAY_COMMANDS` set, so it
   * skips `contextLifecycle`'s acquire ladder entirely (see
   * `tools/audio-play/AGENTS.md`'s device-tolerance section) and
   * `commandHandler.ts` answers it without touching `ZZFX.audioContext`
   * at all. Spawns the sidecar on first call, like every other command
   * here. Exists specifically so a caller (e2e process-lifecycle
   * assertions) can prove the child process is up on a device-less
   * runner, where every audio-touching command legitimately Nacks.
   *
   * A response that never arrives at all rejects after `timeoutMs`
   * instead of wedging `pingChain` forever — see `waitForResponse`.
   */
  async ping(timeoutMs = 10_000): Promise<boolean> {
    const run = this.pingChain.then(() => this.requestPing(timeoutMs))
    this.pingChain = run.catch(() => undefined)
    return run
  }

  private async requestPing(timeoutMs: number): Promise<boolean> {
    this.start()
    if (!this.rl) {
      throw new Error('audio-play: sidecar is not running')
    }

    const id = this.nextRequestId++
    const responsePromise = this.waitForResponse<Nack | Ack>(this.rl, 'ping', id, timeoutMs)
    this.send({ cmd: 'ping', id })
    const response = await responsePromise
    return response.ok
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
   * a dedicated, self-removing `line` listener *before* sending,
   * correlated by a request id the sidecar echoes back (see
   * `waitForResponse` for why ids, not content-matching — a merely LATE
   * response must not shift later callers stale).
   *
   * Concurrent callers are still SERIALIZED (#46): ids make overlap
   * correlation-safe, but one-in-flight keeps the sidecar's response
   * ordering trivially reasoned about and matches how every caller
   * (poll loops) actually uses this. History: pre-id content matching
   * made overlap actively unsafe — with two outstanding, both listeners
   * resolved on the first response line, leaving every later caller one
   * full response STALE, wider than a short one-shot's entire audible
   * window (a real, observed miss with #46's auto-revert watcher).
   *
   * A response that never arrives at all rejects after `timeoutMs`
   * instead of wedging `statsChain` (and with it every future caller)
   * forever — see `waitForResponse`. The default outlasts a legitimate
   * cold-start round trip (native module load + real `AudioContext`
   * through cpal/ALSA/PulseAudio — several seconds on a loaded CI
   * runner) with room to spare.
   */
  async getStats(timeoutMs = 10_000): Promise<PlaybackStats> {
    // statsChain is always the caught tail, so it never rejects — one
    // fulfillment handler is enough, and one failed query can't poison
    // the queue for the callers behind it.
    const run = this.statsChain.then(() => this.requestStats(timeoutMs))
    this.statsChain = run.catch(() => undefined)
    return run
  }

  private async requestStats(timeoutMs: number): Promise<PlaybackStats> {
    this.start()
    if (!this.rl) {
      throw new Error('audio-play: sidecar is not running')
    }

    const id = this.nextRequestId++
    const responsePromise = this.waitForResponse<Nack | StatsAck>(this.rl, 'stats', id, timeoutMs)
    this.send({ cmd: 'stats', id })
    const response = await responsePromise
    if (!response.ok) {
      throw new Error(`audio-play: stats failed: ${response.error}`)
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

  /** Sidecar-process stderr, one line per call — diagnostics only (ready
   * line incl. AudioContext state, resume()/state-change logs); stdout
   * stays the exclusive JSON response channel. Subscribe BEFORE the first
   * play — the listener set is drained from spawn time, so early lines
   * aren't lost to lazy-spawn timing. Returns an unsubscribe function. */
  onStderr(listener: (line: string) => void): () => void {
    this.stderrListeners.add(listener)
    return () => this.stderrListeners.delete(listener)
  }
}
