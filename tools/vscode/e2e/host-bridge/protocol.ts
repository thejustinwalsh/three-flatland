/**
 * Wire format for the minimal RPC bridge between the Playwright/Node test
 * process and the real extension host (loaded via `--extensionTestsPath`).
 * Shared by `runner.ts` (extension-host side) and `client.ts` (Node side).
 */

export type RequestMessage = {
  id: number
  /** Source of a `(vscode, arg) => …` function, evaluated in the host via `new Function`. */
  fn: string
  args: unknown[]
}

export type ResponseMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

/** Written to stderr once the bridge's WebSocket server is ready to accept a connection. */
export const LISTENING_PREFIX = 'FL_E2E_BRIDGE_LISTENING'
