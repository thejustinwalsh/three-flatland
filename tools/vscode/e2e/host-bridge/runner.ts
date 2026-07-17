import * as vscode from 'vscode'
import { WebSocketServer, type WebSocket } from 'ws'
import { LISTENING_PREFIX, type RequestMessage, type ResponseMessage } from './protocol'

/**
 * Loaded via `--extensionTestsPath`, so this runs inside the real
 * extension host with real `vscode` API access — see `e2e/README.md` for
 * why the harness hand-rolls this instead of depending on
 * `vscode-test-playwright`'s own version of it (a real, concrete
 * incompatibility with our pinned `@playwright/test`, not a style choice).
 *
 * Starts a tiny single-purpose WebSocket RPC server: the Node/Playwright
 * side sends `{ id, fn, args }` where `fn` is the source of a
 * `(vscode, arg) => …` function; this evaluates it against the real
 * `vscode` module and real workspace state, and returns the (JSON-safe)
 * result. Deliberately not a general object-handle/event-bridge protocol
 * (compare `vscode-test-playwright`'s `evaluateHandleInVSCode`) — nothing
 * in this harness's specs needs one, and a smaller surface is a smaller
 * thing to keep correct.
 */
export async function run(): Promise<void> {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await new Promise<void>((resolve) => wss.once('listening', resolve))
  const address = wss.address()
  const port = typeof address === 'object' && address ? address.port : 0
  // Read by e2e/host-bridge/client.ts off electronApp.process().stderr.
  process.stderr.write(`${LISTENING_PREFIX} ${port}\n`)

  let activeSocket: WebSocket | undefined
  wss.on('connection', (socket) => {
    activeSocket = socket
    socket.on('message', (raw) => void handleMessage(socket, raw.toString()))
  })

  // Returning from run() tears the extension host down before Playwright
  // gets to call electronApp.close() — hang here until the process itself
  // exits (the Electron app being killed at test teardown), matching the
  // same "never resolve on its own" shape vscode-test-playwright's own
  // injected runner uses for the same reason.
  await new Promise<void>((resolve) => process.on('exit', resolve))
  activeSocket?.close()
  wss.close()
}

async function handleMessage(socket: WebSocket, raw: string): Promise<void> {
  const { id, fn, args } = JSON.parse(raw) as RequestMessage
  let response: ResponseMessage
  try {
    // eslint-disable-next-line no-new-func -- this *is* the RPC eval
    // boundary the harness exists to provide; see e2e/fixtures.ts's
    // `evaluateInVSCode`.
    const evaluator = new Function(`return (${fn})`)() as (vscodeModule: typeof vscode, ...rest: unknown[]) => unknown
    const result = await evaluator(vscode, ...args)
    response = { id, ok: true, result: result ?? null }
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  socket.send(JSON.stringify(response))
}
