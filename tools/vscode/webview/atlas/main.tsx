import '../styles.css'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createClientBridge, getVSCodeApi } from '@three-flatland/bridge/client'
// Suppress the 'custom element already registered' warning that fires when
// any code path re-imports this module at runtime. Documented escape hatch.
;(globalThis as unknown as { __vscodeElements_disableRegistryWarning__?: boolean })
  .__vscodeElements_disableRegistryWarning__ = true
// Side-effect import: registers every <vscode-*> custom element.
import '@vscode-elements/elements'
// Regular CSS import so Vite emits a <link> tag we can tag as the codicon
// stylesheet below.
import '@vscode/codicons/dist/codicon.css'
import { App } from './App'
import * as stylex from '@stylexjs/stylex'
import { vscode as vscodeTokens } from '@three-flatland/design-system/src/tokens/vscode-theme.stylex'

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
let vscode: ReturnType<typeof getVSCodeApi> | null = null
try {
  vscode = getVSCodeApi()
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
  vscode?.postMessage({
    kind: 'request',
    id: `log-${Math.random().toString(36).slice(2)}`,
    method: 'client/log',
    params: { level, args: args.map(safe) },
  })
}

window.addEventListener('error', (e) => send('error', [e.message, `${e.filename}:${e.lineno}:${e.colno}`]))
window.addEventListener('unhandledrejection', (e) => send('unhandledrejection', [safe(e.reason)]))

send('info', ['webview boot'])

// PWA-style live reload. The extension host fs-watches dist/webview/<tool>/
// and emits 'dev/reload' when Vite rebuilds the bundle. We surface it as a
// DOM event that useDevReload() (from the design system) picks up; the UI
// renders a dismissable toast so the user clicks to reload rather than
// having the page yanked out from under them mid-thought.
try {
  const bridge = createClientBridge()
  bridge.on('dev/reload', () => {
    send('info', ['dev/reload — bundle rebuilt'])
    window.dispatchEvent(new Event('fl:dev-changed'))
  })
  // When the toast's Reload button fires fl:reload-request, relay it to
  // the extension host via the bridge — VSCode can't do a real
  // location.reload() on an inline-html webview, so the host re-renders
  // panel.webview.html for us.
  window.addEventListener('fl:reload-request', () => {
    send('info', ['dev/reload-request → asking host to re-render webview'])
    void bridge.request('dev/reload-request').catch((err) => {
      send('error', ['dev/reload-request failed', String(err)])
    })
  })
} catch {
  // Not in a webview (unit/test context) — skip.
}

const ms = stylex.create({
  fallback: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vscodeTokens.bg,
    color: vscodeTokens.descriptionFg,
    fontFamily: vscodeTokens.fontFamily,
    fontSize: vscodeTokens.fontSize,
  },
})

function RootFallback() {
  return (
    <div {...stylex.props(ms.fallback)}>
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
