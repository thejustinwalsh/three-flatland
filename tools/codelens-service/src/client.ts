/**
 * Spawns the `codelens-service` Rust sidecar and speaks its LSP-framed
 * JSON-RPC protocol over stdio. Binary resolution is a separate concern —
 * see `resolveBinary.ts` — the client just takes whatever `binaryPath` it's
 * given.
 */

import { type ChildProcessByStdio, spawn } from 'node:child_process'
import { chmodSync } from 'node:fs'
import type { Readable, Writable } from 'node:stream'
import { encodeMessage, MessageDecoder } from './framing.js'
import type { InitializeResult, NotificationMethods, RequestMethods } from './protocol.js'

export interface CodelensServiceClientOptions {
  /** Path to the `codelens-service` binary. See `resolveBinary()`. */
  binaryPath: string
  workspaceRoot: string
  storageUri: string
  args?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

/** A JSON-RPC error response (`-32700`/`-32601`/`-32602`, or a sidecar-defined code). */
export class CodelensServiceError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message)
    this.name = 'CodelensServiceError'
  }
}

/** Thrown for pending/attempted requests when the sidecar process exits or fails to spawn. */
export class CodelensServiceExitedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CodelensServiceExitedError'
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

interface RpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

type ExitHandler = (code: number | null, signal: NodeJS.Signals | null) => void
type ErrorHandler = (error: Error) => void

export class CodelensServiceClient {
  private child?: ChildProcessByStdio<Writable, Readable, Readable>
  private decoder?: MessageDecoder
  private readonly pending = new Map<number, PendingRequest>()
  private readonly errorHandlers = new Set<ErrorHandler>()
  private readonly exitHandlers = new Set<ExitHandler>()
  private nextId = 1
  private exited = false

  constructor(private readonly options: CodelensServiceClientOptions) {}

  /**
   * Spawns the sidecar process and runs the `initialize` handshake.
   * Requests/notifications sent before `start()` has been called reject/throw
   * immediately — there is no pre-start queue. Calling `start()` more than
   * once throws.
   */
  async start(): Promise<InitializeResult> {
    if (this.child) throw new Error('CodelensServiceClient.start() called more than once')

    // GitHub Actions' upload-artifact/download-artifact round trip
    // normalizes file permissions to 644 (documented limitation, see
    // actions/upload-artifact#38), and a VSIX-packaged binary passes
    // through another zip on top of that — a binary built with the
    // executable bit set in CI can easily arrive here non-executable.
    // Restoring it unconditionally right before spawn, rather than
    // chasing every step that might strip it, is the one place that
    // actually matters. Best-effort: a failure here (e.g. a read-only
    // install location) just falls through to spawn()'s own ENOENT/EACCES
    // handling below — same degrade-not-panic posture as the rest of this
    // client (see AGENTS.md's "Degrade, don't panic").
    if (process.platform !== 'win32') {
      try {
        chmodSync(this.options.binaryPath, 0o755)
      } catch {
        // fall through — spawn() below will surface the real error
      }
    }

    this.child = spawn(this.options.binaryPath, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: this.options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.decoder = new MessageDecoder((body) => this.handleMessage(body))
    this.child.stdout.on('data', (chunk: Buffer) => {
      try {
        this.decoder!.push(chunk)
      } catch (error) {
        // A framing error desyncs the byte stream — MessageDecoder is now
        // poisoned (see framing.ts) and nothing further it produces can be
        // trusted. This is fatal to the whole connection, not just a
        // dropped message: fail every pending request and kill the
        // process rather than pretending the connection is still healthy.
        // Wrapped in CodelensServiceExitedError (not the raw framing
        // Error) so every fatal-connection path — spawn failure, this,
        // unexpected exit — rejects pending requests with the SAME
        // catchable type; the original framing error's message is
        // preserved in the wrapper's message for diagnosis.
        const original = error instanceof Error ? error.message : String(error)
        const wrapped = new CodelensServiceExitedError(`sidecar connection killed by a framing error: ${original}`)
        this.emitError(wrapped)
        this.failConnection(wrapped)
      }
    })
    this.child.on('error', (error) => {
      // Spawn failure (e.g. ENOENT). Node does not reliably guarantee an
      // 'exit' event follows an 'error' event across all failure modes, so
      // `exited` must be set here directly — not left for 'exit' to set —
      // or isExited would stay false forever and later request()/notify()
      // calls could try to write to a process that never came up.
      const wrapped = new CodelensServiceExitedError(`sidecar failed to spawn: ${error.message}`)
      this.emitError(wrapped)
      this.failConnection(wrapped)
    })
    this.child.on('exit', (code, signal) => {
      // If failConnection already ran (spawn error or fatal framing
      // error), this is the same connection's real-but-delayed OS exit —
      // pending requests are already failed and exitHandlers already
      // fired; firing them again here would be a duplicate notification.
      if (this.exited) return
      this.exited = true
      this.failAllPending(
        new CodelensServiceExitedError(`sidecar exited before responding (code=${code}, signal=${signal})`)
      )
      for (const handler of this.exitHandlers) handler(code, signal)
    })

    return this.request('initialize', {
      workspaceRoot: this.options.workspaceRoot,
      storageUri: this.options.storageUri,
    })
  }

  /** The sidecar's stderr stream — pipe to a log/output channel as needed. */
  get stderr(): Readable | undefined {
    return this.child?.stderr
  }

  /** True once the sidecar process has exited (cleanly or otherwise). */
  get isExited(): boolean {
    return this.exited
  }

  /** Subscribes to process-level errors (spawn failure, malformed frames). Returns an unsubscribe function. */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler)
    return () => this.errorHandlers.delete(handler)
  }

  /** Subscribes to the sidecar process exiting. Returns an unsubscribe function. */
  onExit(handler: ExitHandler): () => void {
    this.exitHandlers.add(handler)
    return () => this.exitHandlers.delete(handler)
  }

  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) handler(error)
  }

  private handleMessage(body: Buffer): void {
    let message: RpcResponse
    try {
      message = JSON.parse(body.toString('utf8')) as RpcResponse
    } catch (error) {
      this.emitError(new Error(`codelens-service: malformed JSON frame from sidecar: ${(error as Error).message}`))
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    if (message.error) {
      pending.reject(new CodelensServiceError(message.error.code, message.error.message))
    } else {
      pending.resolve(message.result ?? null)
    }
  }

  private failAllPending(error: Error): void {
    for (const { reject } of this.pending.values()) reject(error)
    this.pending.clear()
  }

  /**
   * Marks the connection dead: fails every pending request, kills the
   * process (best-effort — a spawn failure means there's nothing to
   * kill), and notifies `onExit` subscribers immediately with a
   * `(null, null)` sentinel rather than waiting for (or possibly never
   * receiving) a real OS exit event. Used for both spawn failure and a
   * fatal framing error — the two cases `isExited` must reflect
   * immediately, per this client's exit-tracking contract, rather than
   * risk `isExited` staying `false` forever.
   */
  private failConnection(error: Error): void {
    if (this.exited) return
    this.exited = true
    this.failAllPending(error)
    this.child?.kill()
    for (const handler of this.exitHandlers) handler(null, null)
  }

  private ensureStarted(): ChildProcessByStdio<Writable, Readable, Readable> {
    if (!this.child) {
      throw new CodelensServiceExitedError('call start() before making requests')
    }
    return this.child
  }

  /**
   * Sends a request and resolves/rejects with the sidecar's response.
   * Unlike {@link notify}, this always returns a Promise — even the
   * "not started yet" / "already exited" preconditions reject rather than
   * throw synchronously, so callers can uniformly `await`/`.catch()`.
   */
  request<M extends keyof RequestMethods>(
    method: M,
    params: RequestMethods[M]['params']
  ): Promise<RequestMethods[M]['result']> {
    if (!this.child) {
      return Promise.reject(new CodelensServiceExitedError('call start() before making requests'))
    }
    if (this.exited) {
      return Promise.reject(new CodelensServiceExitedError(`cannot send "${method}": sidecar has already exited`))
    }
    const child = this.child
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }))
    })
  }

  /** Sends a fire-and-forget notification — no response, ever. */
  notify<M extends keyof NotificationMethods>(method: M, params: NotificationMethods[M]): void {
    const child = this.ensureStarted()
    if (this.exited) return
    child.stdin.write(encodeMessage({ jsonrpc: '2.0', method, params }))
  }

  /** Typed `workspace/scan` request. */
  scan(params: RequestMethods['workspace/scan']['params'] = {}) {
    return this.request('workspace/scan', params)
  }

  /** Typed `document/parse` request. */
  parse(params: RequestMethods['document/parse']['params']) {
    return this.request('document/parse', params)
  }

  /** Typed `document/didChange` notification. */
  didChange(params: NotificationMethods['document/didChange']): void {
    this.notify('document/didChange', params)
  }

  /**
   * Graceful shutdown: sends `shutdown`, awaits the response, then awaits
   * the process actually exiting. If it hasn't exited within `timeoutMs`
   * (default 5s), sends SIGKILL and waits for that exit instead — a stuck
   * sidecar must not hang the caller forever.
   */
  async shutdown(timeoutMs = 5000): Promise<void> {
    const child = this.ensureStarted()
    if (this.exited) return

    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    await this.request('shutdown', undefined)

    let timedOut = false
    const timer = new Promise<void>((resolve) => {
      const handle = setTimeout(() => {
        timedOut = true
        resolve()
      }, timeoutMs)
      void exited.then(() => clearTimeout(handle))
    })
    await Promise.race([exited, timer])

    if (timedOut && !this.exited) {
      child.kill('SIGKILL')
      await exited
    }
  }

  /** Forcibly kills the sidecar process without a graceful shutdown handshake. */
  dispose(): void {
    if (this.child && !this.exited) this.child.kill()
  }
}
