export { createPane, wireSceneStats } from './create-pane.js'
export type {
  CreatePaneOptions,
  PaneBundle,
  StatsHandle,
  StatsUpdate,
} from './create-pane.js'
export { addStatsGraph } from './stats-graph.js'
export type { StatsGraphHandle } from './stats-graph.js'
export { applyTheme, FLATLAND_THEME } from './theme.js'
export { registerPlugins, EssentialsPlugin } from './plugins.js'

// Bus consumer — subscribes to the three-flatland debug bus and
// accumulates delta state. See `three-flatland/debug-protocol` for
// the full protocol contract.
export { DevtoolsClient } from './devtools-client.js'
export type { DevtoolsClientOptions, DevtoolsState } from './devtools-client.js'
export { mountDevtoolsPanel } from './devtools-panel.js'
export type { DevtoolsPanelHandle, MountDevtoolsPanelOptions } from './devtools-panel.js'
