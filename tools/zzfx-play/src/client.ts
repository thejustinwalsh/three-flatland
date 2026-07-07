import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import * as readline from 'node:readline'
import type { Command, Response, Song } from './protocol.js'

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
        this.emitError(new Error(`zzfx-play: ${response.cmd} failed: ${response.error}`))
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

  /** Plays a one-shot zzfx sound. Spawns the sidecar on first call. */
  play(params: number[]): void {
    this.send({ cmd: 'play', params })
  }

  /** Plays a ZzFXM song, replacing whatever song is currently playing. Spawns the sidecar on first call. */
  playSong(song: Song): void {
    this.send({ cmd: 'playSong', song })
  }

  /** Stops the currently playing song, if any. No-op if the sidecar isn't running. */
  stopSong(): void {
    if (!this.isRunning) return
    this.send({ cmd: 'stopSong' })
  }

  /** Stops everything currently audible. No-op if the sidecar isn't running. */
  stop(): void {
    if (!this.isRunning) return
    this.send({ cmd: 'stop' })
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
