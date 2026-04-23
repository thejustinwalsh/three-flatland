import type { BridgeMessage, VSCodeApiLike } from './types'

export type EventHandler<TParams = unknown> = (params: TParams) => void

export type ClientBridge = {
  request: <TResult = unknown>(method: string, params?: unknown) => Promise<TResult>
  on: <TParams = unknown>(method: string, handler: EventHandler<TParams>) => () => void
}

let cachedApi: VSCodeApiLike | null = null

function acquireApi(): VSCodeApiLike {
  if (cachedApi) return cachedApi
  const fn = (globalThis as unknown as { acquireVsCodeApi?: () => VSCodeApiLike }).acquireVsCodeApi
  if (!fn) {
    throw new Error('acquireVsCodeApi() is not available — is this running inside a VSCode webview?')
  }
  cachedApi = fn()
  return cachedApi
}

export function createClientBridge(): ClientBridge {
  const api = acquireApi()
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  const listeners = new Map<string, Set<EventHandler>>()

  window.addEventListener('message', (e) => {
    const msg = e.data as BridgeMessage
    if (!msg || typeof msg !== 'object') return
    if (msg.kind === 'response') {
      const entry = pending.get(msg.id)
      if (!entry) return
      pending.delete(msg.id)
      if (msg.ok) entry.resolve(msg.result)
      else entry.reject(new Error(msg.error.message))
    } else if (msg.kind === 'event') {
      const set = listeners.get(msg.method)
      if (!set) return
      for (const fn of set) fn(msg.params)
    }
  })

  return {
    request<TResult = unknown>(method: string, params?: unknown): Promise<TResult> {
      const id = Math.random().toString(36).slice(2)
      return new Promise<TResult>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
        api.postMessage({ kind: 'request', id, method, params } satisfies BridgeMessage)
      })
    },
    on<TParams = unknown>(method: string, handler: EventHandler<TParams>) {
      let set = listeners.get(method)
      if (!set) {
        set = new Set()
        listeners.set(method, set)
      }
      set.add(handler as EventHandler)
      return () => {
        set.delete(handler as EventHandler)
      }
    },
  }
}
