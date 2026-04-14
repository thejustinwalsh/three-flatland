import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Safari polyfill for requestIdleCallback / cancelIdleCallback.
// The example defers Canvas2D compare draws via `requestIdleCallback`
// so the Slug WebGPU frame has a chance to commit first; Safari has
// never shipped the API. The shim runs the callback on a short
// `setTimeout` with a best-effort `timeRemaining()` that matches the
// spec's 50ms budget. Good enough for our deferral use case.
if (typeof window.requestIdleCallback !== 'function') {
  window.requestIdleCallback = (cb: IdleRequestCallback): number => {
    const start = Date.now()
    return setTimeout(() => {
      cb({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
      })
    }, 1) as unknown as number
  }
  window.cancelIdleCallback = (id: number): void => clearTimeout(id)
}

const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
