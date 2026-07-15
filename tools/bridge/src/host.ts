import type { BridgeMessage, WebviewLike } from './types'

export type HostHandler<TParams = unknown, TResult = unknown> = (
  params: TParams
) => TResult | Promise<TResult>

export type HostBridge = {
  emit: (method: string, params?: unknown) => void
  on: <TParams = unknown, TResult = unknown>(
    method: string,
    handler: HostHandler<TParams, TResult>
  ) => void
  dispose: () => void
}

export function createHostBridge(webview: WebviewLike): HostBridge {
  const handlers = new Map<string, HostHandler>()

  const sub = webview.onDidReceiveMessage(async (raw) => {
    const msg = raw as BridgeMessage
    if (!msg || typeof msg !== 'object') return
    if (msg.kind === 'request') {
      const h = handlers.get(msg.method)
      if (!h) {
        webview.postMessage({
          kind: 'response',
          id: msg.id,
          ok: false,
          error: { message: `No handler for "${msg.method}"` },
        } satisfies BridgeMessage)
        return
      }
      try {
        const result = await h(msg.params as never)
        webview.postMessage({ kind: 'response', id: msg.id, ok: true, result } satisfies BridgeMessage)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        webview.postMessage({ kind: 'response', id: msg.id, ok: false, error: { message } } satisfies BridgeMessage)
      }
    }
  })

  return {
    emit(method, params) {
      webview.postMessage({ kind: 'event', method, params } satisfies BridgeMessage)
    },
    on(method, handler) {
      handlers.set(method, handler as HostHandler)
    },
    dispose() {
      sub.dispose()
      handlers.clear()
    },
  }
}
