/** @jsxImportSource preact */
/**
 * Devtools dashboard — standalone full-page inspector.
 *
 * Mounted by the Vite plugin at `/__three-flatland__/devtools`. Shares the
 * same `BroadcastChannel` discovery as the Tweakpane client, so any producer
 * the app creates is visible here automatically. No dependency on Tweakpane.
 *
 * Rendered with vendored Preact (see `./vendor/`). No runtime dep leaks into
 * the published package — the plugin only serves this entry when the user
 * opts in.
 */
import { render } from 'preact'
import { App } from './app'

const root = document.getElementById('root')
if (root === null) throw new Error('[devtools-dashboard] #root missing')
render(<App />, root)
