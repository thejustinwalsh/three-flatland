/** @jsxImportSource preact */
/**
 * Dashboard root layout. Producer switcher lives in the header to
 * reclaim left-rail real estate — the rail is gone, the content area
 * fills the full viewport.
 */
import { BatchesPanel } from './panels/batches.js'
import { BuffersPanel } from './panels/buffers.js'
import { EnvPopover } from './panels/env.js'
import { HeaderStats } from './panels/header-stats.js'
import { ProducerSelect } from './panels/producer-select.js'
import { ProtocolLog } from './panels/protocol-log.js'
import { RegistryPanel } from './panels/registry.js'
import { StatsStrip } from './panels/stats.js'

export function App() {
  return (
    <div class="dashboard-root">
      <header class="dashboard-header">
        <span class="brand">three-flatland devtools</span>
        <ProducerSelect />
        <EnvPopover />
        <HeaderStats />
      </header>
      <main class="dashboard-main">
        <section class="dashboard-content">
          <StatsStrip />
          <div class="dashboard-split">
            <div class="dashboard-split-col">
              <BuffersPanel />
              <BatchesPanel />
              <RegistryPanel />
            </div>
            <div class="dashboard-split-col">
              <ProtocolLog />
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
