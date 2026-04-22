/**
 * Singleton `DevtoolsClient` for the dashboard page.
 *
 * The dashboard runs on the same origin as the app (via the microfrontend
 * proxy) so a regular `new DevtoolsClient()` here reaches every producer
 * the app creates via `BroadcastChannel`. One client covers the whole
 * page — all panels share it and subscribe to the same state.
 */
import { DevtoolsClient } from '../devtools-client.js'

const ALL_FEATURES = ['stats', 'env', 'registry', 'buffers'] as const

let instance: DevtoolsClient | null = null

export function getClient(): DevtoolsClient {
  if (instance === null) {
    instance = new DevtoolsClient({ features: [...ALL_FEATURES] })
    instance.start()
  }
  return instance
}
