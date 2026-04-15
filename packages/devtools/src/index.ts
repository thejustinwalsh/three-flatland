export { createPane } from './create-pane.js'
export type { CreatePaneOptions, PaneBundle } from './create-pane.js'
export { applyTheme, FLATLAND_THEME } from './theme.js'
export { registerPlugins, EssentialsPlugin } from './plugins.js'

// Bus consumer — advanced; normal users don't touch this directly.
// The stats graph + stats row (auto-mounted by `createPane`) drive off a
// shared instance under the hood. Exposed for callers who want a
// secondary consumer on the same bus (e.g., a custom visualisation).
export { DevtoolsClient } from './devtools-client.js'
export type {
  DevtoolsClientOptions,
  DevtoolsState,
  DevtoolsStateListener,
} from './devtools-client.js'
