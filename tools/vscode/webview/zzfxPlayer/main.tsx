import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createClientBridge, getVSCodeApi } from '@three-flatland/bridge/client'
import { App } from './App'

// Forward uncaught errors to the FL Tools output channel so 'empty panel'
// situations are diagnosable without opening Webview Developer Tools.
let vscodeApi: ReturnType<typeof getVSCodeApi> | null = null
try {
  vscodeApi = getVSCodeApi()
} catch {}

function send(level: string, args: unknown[]) {
  vscodeApi?.postMessage({
    kind: 'request',
    id: `log-${Math.random().toString(36).slice(2)}`,
    method: 'client/log',
    params: { level, args },
  })
}

window.addEventListener('error', (e) =>
  send('error', [e.message, `${e.filename}:${e.lineno}:${e.colno}`])
)
window.addEventListener('unhandledrejection', (e) => send('unhandledrejection', [String(e.reason)]))
send('info', ['zzfxPlayer webview boot'])

// PWA-style live reload. The extension host fs-watches dist/webview/<tool>/
// and emits 'dev/reload' when Vite rebuilds the bundle. Guarded — standalone
// (no acquireVsCodeApi) just skips live reload wiring.
try {
  const bridge = createClientBridge()
  bridge.on('dev/reload', () => window.dispatchEvent(new Event('fl:dev-changed')))
  window.addEventListener('fl:reload-request', () => {
    void bridge.request('dev/reload-request')
  })
} catch {}

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
