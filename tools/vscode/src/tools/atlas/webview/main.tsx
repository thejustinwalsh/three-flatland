import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { getVSCodeApi } from '@three-flatland/bridge/client'
// Side-effect import: registers every <vscode-*> custom element with the
// browser's CustomElementRegistry. Without this the React wrappers render
// inert unknown tags.
import '@vscode-elements/elements'
import { App } from './App'

// Forward uncaught errors + console.error to the extension host output
// channel so "empty panel" situations are diagnosable without opening
// Webview Developer Tools.
let vscode: ReturnType<typeof getVSCodeApi> | null = null
try {
  vscode = getVSCodeApi()
} catch {
  // Not running inside a webview — no-op; nothing to forward.
}

function send(level: string, args: unknown[]) {
  vscode?.postMessage({
    kind: 'request',
    id: `log-${Math.random().toString(36).slice(2)}`,
    method: 'client/log',
    params: { level, args: args.map(safe) },
  })
}

function safe(v: unknown): unknown {
  try {
    if (v instanceof Error) return { message: v.message, stack: v.stack }
    JSON.stringify(v)
    return v
  } catch {
    return String(v)
  }
}

window.addEventListener('error', (e) => send('error', [e.message, `${e.filename}:${e.lineno}:${e.colno}`]))
window.addEventListener('unhandledrejection', (e) => send('unhandledrejection', [safe(e.reason)]))

for (const level of ['log', 'info', 'warn', 'error'] as const) {
  const orig = console[level]
  console[level] = (...args: unknown[]) => {
    send(level, args)
    orig.apply(console, args as never[])
  }
}

send('info', ['webview boot'])

function RootFallback() {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--vscode-editor-background)',
        color: 'var(--vscode-descriptionForeground)',
        fontFamily: 'var(--vscode-font-family)',
        fontSize: 'var(--vscode-font-size)',
      }}
    >
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
  // Outer Suspense boundary — lives in the React DOM reconciler.
  // Catches any DOM-side async work that suspends at or below <App/>
  // (dynamic imports, React.lazy, non-R3F suspense-reading hooks).
  //
  // A SECOND Suspense boundary lives inside <Canvas> in SpritePreview —
  // that one is in the @react-three/fiber reconciler, which is a
  // separate React tree. R3F's useLoader() suspends there, not here,
  // so it must have its own boundary.
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
