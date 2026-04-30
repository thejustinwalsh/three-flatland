import '../styles.css'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createClientBridge, getVSCodeApi } from '@three-flatland/bridge/client'
// Suppress the 'custom element already registered' warning that fires when
// any code path re-imports this module at runtime. Documented escape hatch.
;(globalThis as unknown as { __vscodeElements_disableRegistryWarning__?: boolean })
  .__vscodeElements_disableRegistryWarning__ = true
// Side-effect imports for <vscode-*> elements used as raw JSX intrinsics
// in this entry. Every other element (toolbar-button, icon, badge, ...)
// is registered transitively when its React wrapper is imported by the
// design-system primitive that uses it — no blanket bundle needed.
import '@vscode-elements/elements/dist/vscode-progress-ring/index.js'
// Regular CSS import so Vite emits a <link> tag we can tag as the codicon
// stylesheet below.
import '@vscode/codicons/dist/codicon.css'
import { App } from './App'

// Tag the main stylesheet link as 'vscode-codicon-stylesheet' so VscodeIcon
// can mirror the codicon font rules into each icon's shadow root.
function tagCodiconStylesheet() {
  if (document.getElementById('vscode-codicon-stylesheet')) return
  const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')
  if (link) link.id = 'vscode-codicon-stylesheet'
}
tagCodiconStylesheet()

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
window.addEventListener('unhandledrejection', (e) =>
  send('unhandledrejection', [String(e.reason)])
)
send('info', ['merge webview boot'])

// PWA-style live reload. The extension host fs-watches dist/webview/<tool>/
// and emits 'dev/reload' when Vite rebuilds the bundle.
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
    <Suspense fallback={<vscode-progress-ring />}>
      <App />
    </Suspense>
  </StrictMode>
)
