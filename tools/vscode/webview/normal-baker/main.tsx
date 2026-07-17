import '../styles.css'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createClientBridge, getVSCodeApi } from '@three-flatland/bridge/client'
// Suppress the 'custom element already registered' warning that fires when
// any code path re-imports this module at runtime. Documented escape hatch.
;(
  globalThis as unknown as { __vscodeElements_disableRegistryWarning__?: boolean }
).__vscodeElements_disableRegistryWarning__ = true
import '@vscode-elements/elements/dist/vscode-progress-ring/index.js'
import '@vscode/codicons/dist/codicon.css'
import { App } from './App'
// Warm the lazy canvas chunk (R3F + three + three-flatland) so its fetch
// overlaps with the initial shell render instead of waiting for App to
// reach the <Suspense> boundary.
void import('@three-flatland/preview/canvas')
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'

function tagCodiconStylesheet() {
  if (document.getElementById('vscode-codicon-stylesheet')) return
  const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')
  if (link) link.id = 'vscode-codicon-stylesheet'
}
tagCodiconStylesheet()

// Forward uncaught errors to the Flatland Tools output channel so 'empty panel'
// situations are diagnosable without opening Webview Developer Tools.
// Guarded: standalone dev mode (opening dist/webview/normal-baker/index.html
// directly, no acquireVsCodeApi) has no host to forward to.
let vscodeApi: ReturnType<typeof getVSCodeApi> | null = null
try {
  vscodeApi = getVSCodeApi()
} catch {}

function safe(v: unknown): unknown {
  try {
    if (v instanceof Error) return { message: v.message, stack: v.stack }
    JSON.stringify(v)
    return v
  } catch {
    return String(v)
  }
}

function send(level: string, args: unknown[]) {
  vscodeApi?.postMessage({
    kind: 'request',
    id: `log-${Math.random().toString(36).slice(2)}`,
    method: 'client/log',
    params: { level, args: args.map(safe) },
  })
}

window.addEventListener('error', (e) => send('error', [e.message, `${e.filename}:${e.lineno}:${e.colno}`]))
window.addEventListener('unhandledrejection', (e) => send('unhandledrejection', [safe(e.reason)]))

send('info', ['webview boot'])

// PWA-style live reload. Guarded the same way as the error forwarder —
// standalone dev mode has no bridge to talk to.
try {
  const bridge = createClientBridge()
  bridge.on('dev/reload', () => {
    send('info', ['dev/reload — bundle rebuilt'])
    window.dispatchEvent(new Event('fl:dev-changed'))
  })
  window.addEventListener('fl:reload-request', () => {
    send('info', ['dev/reload-request → asking host to re-render webview'])
    void bridge.request('dev/reload-request').catch((err) => {
      send('error', ['dev/reload-request failed', String(err)])
    })
  })
} catch {
  // Not in a webview (unit/test context, or standalone dev mode) — skip.
}

const s = stylex.create({
  fallback: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vscode.bg,
    color: vscode.descriptionFg,
    fontFamily: vscode.fontFamily,
    fontSize: vscode.fontSize,
  },
})

function RootFallback() {
  return (
    <div {...stylex.props(s.fallback)}>
      <vscode-progress-ring />
    </div>
  )
}

const root = document.getElementById('root')
if (!root) {
  send('error', ['Root element missing'])
  throw new Error('Root element missing')
}

try {
  createRoot(root).render(
    <StrictMode>
      <Suspense fallback={<RootFallback />}>
        <App />
      </Suspense>
    </StrictMode>
  )
  send('info', ['react mounted'])
} catch (err) {
  send('error', ['React mount threw', safe(err)])
  throw err
}
