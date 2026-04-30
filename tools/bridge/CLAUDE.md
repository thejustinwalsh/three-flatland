# @three-flatland/bridge

> Agent-facing reference for the host ↔ webview message bridge.

## Two halves

- **Webview side:** `import { createClientBridge, getVSCodeApi } from '@three-flatland/bridge/client'`
- **Host side:** `import { createHostBridge } from '@three-flatland/bridge/host'`
- Root `@three-flatland/bridge` re-exports everything; prefer the subpaths so each side pulls only what it needs.

Each tool creates one bridge of each: a `ClientBridge` inside the webview's `main.tsx` (or `App`), a `HostBridge` inside the extension's `host.ts`. They talk via `postMessage` round-trips that the bridge multiplexes using a random `id` per request.

Source: `tools/bridge/src/`

---

## ClientBridge (webview side)

```ts
type ClientBridge = {
  request: <TResult = unknown>(method: string, params?: unknown) => Promise<TResult>
  on:      <TParams = unknown>(method: string, handler: (params: TParams) => void) => () => void
}
```

- **`request(method, params)`** — sends a request to the host. Returns a `Promise` that resolves with the host handler's return value, or rejects with an `Error` if the host throws.
- **`on(method, handler)`** — subscribes to events pushed by the host via `emit`. Handler is `(params) => void` — no return value. Returns an **unsubscribe function**: `const off = bridge.on(...); ...; off()`.
- **There is NO `bridge.dispose()` on `ClientBridge`.** This is the most common mistake.

```tsx
// Correct webview-side cleanup
useEffect(() => {
  const bridge = createClientBridge()
  const offInit = bridge.on('mytool/init', (p) => setState(p))
  void bridge.request('mytool/ready')
  return () => { offInit() }
}, [])
```

```tsx
// Wrong — no such method on ClientBridge
return () => bridge.dispose()
```

---

## HostBridge (extension side)

```ts
type HostBridge = {
  on:      <TParams, TResult>(method: string, handler: (params: TParams) => TResult | Promise<TResult>) => void
  emit:    <TParams>(method: string, params?: TParams) => void
  dispose: () => void
}
```

- **`on(method, handler)`** — registers a handler for webview-initiated requests. Sync or async; the return value becomes the response payload. Throwing rejects the webview's `bridge.request` promise.
- **`emit(method, params)`** — pushes an event to the webview. Fire-and-forget; no response.
- **`dispose()`** — clears all handlers and tears down the `onDidReceiveMessage` subscription. Call from `panel.onDidDispose`.

```ts
// Correct host-side wiring
const bridge = createHostBridge(panel.webview)

bridge.on('mytool/ready', async (_params) => {
  bridge.emit('mytool/init', { sources: [...] })
  return { ok: true }
})

bridge.on('mytool/save', async (params) => {
  // ...do work...
  return { ok: true, uri: '...' }
})

panel.onDidDispose(() => bridge.dispose())
```

---

## Asymmetry — handlers don't share the same shape

| Side | Method | Handler signature | Returns to caller? |
|------|--------|-------------------|--------------------|
| Webview `bridge.on` | event subscriber | `(params) => void` | No — fire-and-forget |
| Host `bridge.on` | request handler | `(params) => TResult \| Promise<TResult>` | Yes — becomes request response |

Don't confuse them. A webview-side `bridge.on` handler that returns a value is silently ignored.

---

## Handshake pattern (used by every tool)

Every tool boots with this two-step handshake:

```
Webview (on mount):
  bridge.on('mytool/init', (p) => applyInitPayload(p))
  bridge.request('mytool/ready')

Host (in 'mytool/ready' handler):
  // ...resolve URIs, load sidecar, etc....
  bridge.emit('mytool/init', { ...everything the webview needs... })
  return { ok: true }
```

- The webview registers its `init` listener **before** calling `request('ready')` to avoid a race.
- `request` and `emit` are different directions: webview→host uses `request`; host→webview uses `emit`.

---

## Error propagation

A throw inside a host `bridge.on` handler:
- Bridge sends `{ kind: 'response', ok: false, error: { message } }` back.
- Webview's `bridge.request` promise rejects with `new Error(message)`.

Catch on the webview side and surface a UI banner. If logging back to the host is useful, use `bridge.request('client/log', { message })`.

---

## `getVSCodeApi()` — singleton

`acquireVsCodeApi()` may only be called **once** per webview page lifetime; subsequent calls throw. `getVSCodeApi()` caches the handle so multiple modules can call it freely. `createClientBridge()` calls it internally — you don't need it directly unless posting messages outside the bridge (e.g., from `window.addEventListener('error', ...)`).

---

## Common pitfalls

- `() => bridge.dispose()` on the webview side — **no such method**; call the `off` functions instead.
- Returning a value from a webview-side `bridge.on` handler — it is ignored.
- Calling `acquireVsCodeApi()` directly from multiple modules — use `getVSCodeApi()`.
- Using `request` for a host→webview push — that direction is `emit` (host) + `on` (webview).
- Registering the `init` listener after calling `request('ready')` — register first to avoid the race.

---

## Reference

- Source types: `tools/bridge/src/types.ts`, `tools/bridge/src/client.ts`, `tools/bridge/src/host.ts`
- Package exports (root + `/host` + `/client` subpaths): `tools/bridge/package.json`
- Example host wiring: `tools/vscode/extension/tools/atlas/sidecar.ts`
- Example webview boot: `tools/vscode/webview/atlas/main.tsx`
