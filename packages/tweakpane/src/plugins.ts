import type { Pane } from 'tweakpane'
import * as EssentialsPlugin from '@tweakpane/plugin-essentials'

export function registerPlugins(pane: Pane): void {
  pane.registerPlugin(EssentialsPlugin)
}

export { EssentialsPlugin }
