export type BridgeMessage =
  | { kind: 'request'; id: string; method: string; params?: unknown }
  | { kind: 'response'; id: string; ok: true; result?: unknown }
  | { kind: 'response'; id: string; ok: false; error: { message: string } }
  | { kind: 'event'; method: string; params?: unknown }

export type BridgeSchema = {
  // Routes host → webview
  requests: Record<string, (params: never) => unknown | Promise<unknown>>
  // Routes webview → host
  events: Record<string, unknown>
}

export type VSCodeApiLike = {
  postMessage: (msg: unknown) => void
}

export type WebviewLike = {
  postMessage: (msg: unknown) => Thenable<boolean> | boolean
  onDidReceiveMessage: (listener: (e: unknown) => unknown) => { dispose(): void }
}

export type Thenable<T> = PromiseLike<T>
