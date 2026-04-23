import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getVSCodeApi } from '@three-flatland/bridge/client'
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

const root = document.getElementById('root')
if (!root) {
  send('error', ['Root element missing'])
  throw new Error('Root element missing')
}

try {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
  send('info', ['react mounted'])
} catch (err) {
  send('error', ['React mount threw', safe(err)])
  throw err
}
