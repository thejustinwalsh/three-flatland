import type { FolderApi, Pane } from 'tweakpane'
import { DevtoolsClient, type DevtoolsState } from './devtools-client.js'

export interface MountDevtoolsPanelOptions {
  /** Override the bus channel name (rare — mostly for isolated tests). */
  channelName?: string
  /** Optional title for the folder. Default: `Devtools`. */
  title?: string
  /**
   * Share an existing `DevtoolsClient` instead of constructing one.
   * `createPane` uses this to construct one client per pane and have
   * both the panel and the stats graph/row subscribe to it — one
   * source of truth, no duplicate bus subscriptions.
   *
   * If provided, the panel won't dispose the client when the panel
   * goes away (the owner of the client is responsible).
   */
  client?: DevtoolsClient
}

/**
 * Result of `mountDevtoolsPanel` — gives the caller the underlying
 * client (for manual feature-set changes / disposal) plus a
 * `dispose()` helper that tears everything down together.
 */
export interface DevtoolsPanelHandle {
  /** The bus consumer. `client.id` is the consumer UUID. */
  readonly client: DevtoolsClient
  /** The tweakpane folder the panel mounted into. */
  readonly folder: FolderApi
  /** Close the bus subscription + remove the folder. Idempotent. */
  dispose(): void
}

/**
 * Mount a devtools panel inside the given tweakpane Pane. Subscribes
 * to the `stats` and `env` features on the debug bus and renders
 * readonly monitors for every value the consumer accumulates.
 *
 * Intended as the default / reference UI. Apps that want a custom
 * layout can construct `DevtoolsClient` directly and wire its
 * `onChange` callback into their own UI.
 */
export function mountDevtoolsPanel(
  pane: Pane,
  options: MountDevtoolsPanelOptions = {},
): DevtoolsPanelHandle {
  // Display-state object — tweakpane binds to this, monitors refresh
  // from its values. We copy accumulated state into these fields each
  // time the client fires `onChange` and then refresh the folder.
  const display = {
    frame: '0',
    fps: 0,
    cpuMs: 0,
    gpuMs: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    backend: 'unknown',
    threeVersion: 'unknown',
    flatlandVersion: 'unknown',
    gpuMode: 'off',
    canvas: '0×0',
    pixelRatio: 1,
    serverAlive: 'waiting',
    serverLagMs: 0,
  }

  const folder = pane.addFolder({ title: options.title ?? 'Devtools', expanded: true })

  const liveness = folder.addFolder({ title: 'Liveness', expanded: false })
  liveness.addBinding(display, 'serverAlive', { readonly: true, label: 'server' })
  liveness.addBinding(display, 'serverLagMs', {
    readonly: true,
    label: 'lag ms',
    format: (v: number) => v.toFixed(0),
  })

  const perf = folder.addFolder({ title: 'Perf', expanded: true })
  perf.addBinding(display, 'fps', { readonly: true, format: (v: number) => v.toFixed(1) })
  perf.addBinding(display, 'cpuMs', { readonly: true, label: 'cpu ms', format: (v: number) => v.toFixed(2) })
  perf.addBinding(display, 'gpuMs', { readonly: true, label: 'gpu ms', format: (v: number) => v.toFixed(2) })
  perf.addBinding(display, 'frame', { readonly: true })

  const scene = folder.addFolder({ title: 'Scene', expanded: true })
  scene.addBinding(display, 'drawCalls', { readonly: true, label: 'draws' })
  scene.addBinding(display, 'triangles', { readonly: true, label: 'tris' })
  scene.addBinding(display, 'geometries', { readonly: true, label: 'geoms' })
  scene.addBinding(display, 'textures', { readonly: true, label: 'texs' })

  const env = folder.addFolder({ title: 'Environment', expanded: false })
  env.addBinding(display, 'backend', { readonly: true })
  env.addBinding(display, 'gpuMode', { readonly: true, label: 'gpu timing' })
  env.addBinding(display, 'canvas', { readonly: true })
  env.addBinding(display, 'pixelRatio', { readonly: true, label: 'dpr' })
  env.addBinding(display, 'threeVersion', { readonly: true, label: 'three' })
  env.addBinding(display, 'flatlandVersion', { readonly: true, label: 'flatland' })

  const ownsClient = options.client === undefined
  const client = options.client ?? new DevtoolsClient({
    features: ['stats', 'env'],
    channelName: options.channelName,
  })

  // Seed the display from any state the client has already accumulated
  // (relevant when `createPane` constructs the client first, then the
  // panel subscribes — there may be initial announces already).
  copyState(client.state, display)
  folder.refresh()

  const unsubscribe = client.addListener((state) => {
    copyState(state, display)
    folder.refresh()
  })

  // Only start the client if we constructed it. When sharing a
  // caller-supplied client, the caller is responsible for `start()`.
  if (ownsClient) client.start()

  return {
    client,
    folder,
    dispose() {
      unsubscribe()
      if (ownsClient) client.dispose()
      try { folder.dispose() } catch { /* already disposed */ }
    },
  }
}

/** Snapshot the client's accumulated state into the tweakpane display bag. */
function copyState(s: DevtoolsState, d: {
  frame: string; fps: number; cpuMs: number; gpuMs: number
  drawCalls: number; triangles: number; geometries: number; textures: number
  backend: string; threeVersion: string; flatlandVersion: string
  gpuMode: string; canvas: string; pixelRatio: number
  serverAlive: string; serverLagMs: number
}): void {
  d.frame = String(s.frame ?? 0)
  d.fps = s.fps ?? 0
  d.cpuMs = s.cpuMs ?? 0
  d.gpuMs = s.gpuMs ?? 0
  d.drawCalls = s.drawCalls ?? 0
  d.triangles = s.triangles ?? 0
  d.geometries = s.geometries ?? 0
  d.textures = s.textures ?? 0
  d.backend = s.backendName ?? 'unknown'
  d.threeVersion = s.threeRevision ?? 'unknown'
  d.flatlandVersion = s.threeFlatlandVersion ?? 'unknown'
  d.gpuMode = s.gpuModeEnabled ? 'on' : 'off'
  const w = s.canvasWidth
  const h = s.canvasHeight
  d.canvas = w != null && h != null ? `${w}×${h}` : '0×0'
  d.pixelRatio = s.canvasPixelRatio ?? 1
  d.serverAlive = s.serverAlive ? 'alive' : 'dead'
  d.serverLagMs = s.serverLagMs
}
