/**
 * Spawns the `codelens-service` Rust sidecar and speaks its LSP-framed
 * JSON-RPC protocol over stdio. Binary resolution (dev-mode `cargo`
 * target dir vs. a VSIX-bundled path) is the caller's responsibility —
 * pass whatever `command` resolves to the right binary for the host.
 */

import { type ChildProcessByStdio, spawn } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { encodeMessage, MessageDecoder } from './framing.js'
import type { NotificationMethods, RequestMethods } from './protocol.js'

export interface CodelensServiceClientOptions {
  /** Path to the `codelens-service` binary, or a PATH-resolvable name. */
  command: string
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

/** Thrown for pending requests when the sidecar process exits or fails to spawn. */
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

export class CodelensServiceClient {
  private readonly child: ChildProcessByStdio<Writable, Readable, Readable>
  private readonly decoder: MessageDecoder
  private readonly pending = new Map<number, PendingRequest>()
  private nextId = 1
  private exited = false

  constructor(options: CodelensServiceClientOptions) {
    this.child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.decoder = new MessageDecoder((body) => this.handleMessage(body))
    this.child.stdout.on('data', (chunk: Buffer) => this.decoder.push(chunk))
    this.child.on('error', (error) =>
      this.failAllPending(
        new CodelensServiceExitedError(`sidecar failed to spawn: ${error.message}`)
      )
    )
    this.child.on('exit', (code, signal) => {
      this.exited = true
      this.failAllPending(
        new CodelensServiceExitedError(
          `sidecar exited before responding (code=${code}, signal=${signal})`
        )
      )
    })
  }

  /** The sidecar's stderr stream — pipe to a log/output channel as needed. */
  get stderr(): Readable {
    return this.child.stderr
  }

  /** True once the sidecar process has exited (cleanly or otherwise). */
  get isExited(): boolean {
    return this.exited
  }

  private handleMessage(body: Buffer): void {
    let message: RpcResponse
    try {
      message = JSON.parse(body.toString('utf8')) as RpcResponse
    } catch {
      return // malformed frame from the sidecar — nothing sane to correlate it to.
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

  /** Sends a request and resolves/rejects with the sidecar's response. */
  request<M extends keyof RequestMethods>(
    method: M,
    params: RequestMethods[M]['params']
  ): Promise<RequestMethods[M]['result']> {
    if (this.exited) {
      return Promise.reject(
        new CodelensServiceExitedError(`cannot send "${method}": sidecar has already exited`)
      )
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }))
    })
  }

  /** Sends a fire-and-forget notification — no response, ever. */
  notify<M extends keyof NotificationMethods>(method: M, params: NotificationMethods[M]): void {
    if (this.exited) return
    this.child.stdin.write(encodeMessage({ jsonrpc: '2.0', method, params }))
  }

  /** Typed `initialize` request. */
  initialize(params: RequestMethods['initialize']['params']) {
    return this.request('initialize', params)
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

  /** Sends `shutdown` and waits for the process to exit. */
  async shutdown(): Promise<void> {
    if (this.exited) return
    const exitPromise = new Promise<void>((resolve) => this.child.once('exit', () => resolve()))
    await this.request('shutdown', undefined)
    await exitPromise
  }

  /** Forcibly kills the sidecar process without a graceful shutdown handshake. */
  dispose(): void {
    if (!this.exited) this.child.kill()
  }
}
