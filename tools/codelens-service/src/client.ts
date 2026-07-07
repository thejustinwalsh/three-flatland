/**
 * Spawns the `codelens-service` Rust sidecar and speaks its LSP-framed
 * JSON-RPC protocol over stdio. Binary resolution is a separate concern —
 * see `resolveBinary.ts` — the client just takes whatever `binaryPath` it's
 * given.
 */

import { type ChildProcessByStdio, spawn } from 'node:child_process'
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
        this.emitError(error instanceof Error ? error : new Error(String(error)))
      }
    })
    this.child.on('error', (error) => {
      const wrapped = new CodelensServiceExitedError(`sidecar failed to spawn: ${error.message}`)
      this.emitError(wrapped)
      this.failAllPending(wrapped)
    })
    this.child.on('exit', (code, signal) => {
      this.exited = true
      this.failAllPending(
        new CodelensServiceExitedError(
          `sidecar exited before responding (code=${code}, signal=${signal})`
        )
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
      this.emitError(
        new Error(
          `codelens-service: malformed JSON frame from sidecar: ${(error as Error).message}`
        )
      )
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
      return Promise.reject(
        new CodelensServiceExitedError(`cannot send "${method}": sidecar has already exited`)
      )
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
      exited.then(() => clearTimeout(handle))
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
