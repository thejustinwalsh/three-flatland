import * as readline from 'node:readline'
import type { ChildProcess } from 'node:child_process'
import { WebSocket } from 'ws'
import { LISTENING_PREFIX, type RequestMessage, type ResponseMessage } from './protocol'

/**
 * Node-side half of the host bridge — see `runner.ts` for the
 * extension-host side and `e2e/README.md` for why this harness hand-rolls
 * this instead of depending on `vscode-test-playwright`'s equivalent.
 */

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

export class HostBridgeClient {
  private nextId = 1
  private pending = new Map<number, Pending>()
  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (raw) => this.onMessage(raw.toString()))
  }

  /**
   * Watches the extension host's stderr for the bridge's "listening"
   * line, then connects. Must be attached as early as possible after the
   * Electron process is available — VS Code's extension host activates
   * (and the bridge starts) well before any UI interaction is otherwise
   * possible, but a listener attached late can still miss already-flushed
   * output.
   */
  static async connect(process: ChildProcess): Promise<HostBridgeClient> {
    const port = await waitForListeningPort(process)
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', reject)
    })
    return new HostBridgeClient(ws)
  }

  private onMessage(raw: string): void {
    const msg = JSON.parse(raw) as ResponseMessage
    const entry = this.pending.get(msg.id)
    if (!entry) return
    this.pending.delete(msg.id)
    if (msg.ok) entry.resolve(msg.result)
    else entry.reject(new Error(msg.error))
  }

  /**
   * Evaluates `fn` inside the real extension host with real `vscode` API
   * access. `fn` is shipped as source (`Function.prototype.toString()`),
   * the same mechanism Playwright's own `page.evaluate` uses — it must
   * not reference outer closure variables, only its `vscode` and `arg`
   * parameters, since it's reconstructed via `new Function` on the other
   * side of the wire, not actually closed over anything here.
   */
  evaluate<R, Arg = undefined>(
    fn: (vscodeModule: typeof import('vscode'), arg: Arg) => R | Promise<R>,
    arg?: Arg
  ): Promise<R> {
    const id = this.nextId++
    const message: RequestMessage = {
      id,
      fn: fn.toString(),
      args: arg !== undefined ? [arg] : [],
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.ws.send(JSON.stringify(message))
    })
  }

  close(): void {
    this.ws.close()
  }
}

function waitForListeningPort(child: ChildProcess): Promise<number> {
  if (!child.stderr) throw new Error('electron process has no stderr stream')
  const regex = new RegExp(`^${LISTENING_PREFIX} (\\d+)$`)
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: child.stderr! })
    const onLine = (line: string) => {
      const match = line.match(regex)
      if (!match) return
      cleanup()
      resolve(Number(match[1]))
    }
    const onExit = () => {
      cleanup()
      reject(new Error('electron process exited before the e2e host bridge started listening'))
    }
    const cleanup = () => {
      rl.off('line', onLine)
      child.off('exit', onExit)
    }
    rl.on('line', onLine)
    child.once('exit', onExit)
  })
}
