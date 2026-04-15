import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Scene } from 'three'
import {
  claimPane,
  createPane,
  wireSceneStats,
  type PaneBundle,
  type StatsHandle,
} from './create-pane'

// Bundles created by makePane() are auto-claimed (so the next createPane()
// doesn't try to dispose them as orphans) and tracked for afterEach cleanup.
let bundles: PaneBundle[] = []
function makePane(options: Parameters<typeof createPane>[0] = {}): PaneBundle {
  const bundle = createPane({ debug: false, ...options })
  claimPane(bundle)
  bundles.push(bundle)
  return bundle
}

describe('createPane', () => {
  afterEach(() => {
    for (const b of bundles) {
      try {
        b.pane.dispose()
      } catch {
        /* already disposed */
      }
    }
    bundles = []
    document.body.innerHTML = ''
  })

  it('returns a bundle with pane + stats handles', () => {
    const bundle = makePane()

    expect(bundle.pane).toBeDefined()
    expect(bundle.pane.element).toBeInstanceOf(HTMLElement)
    expect(bundle.stats).toBeDefined()
    expect(typeof bundle.stats.begin).toBe('function')
    expect(typeof bundle.stats.end).toBe('function')
    expect(typeof bundle.stats.update).toBe('function')
  })

  it('mounts the pane element to document.body', () => {
    const bundle = makePane()
    // Tweakpane appends to document.body by default
    expect(document.body.contains(bundle.pane.element)).toBe(true)
  })

  it('uses the title from options', () => {
    const bundle = makePane({ title: 'CustomTitle' })
    expect(bundle.pane.element.textContent).toContain('CustomTitle')
  })

  it('disposes cleanly without throwing', () => {
    const bundle = makePane()
    expect(() => {
      bundle.pane.dispose()
    }).not.toThrow()
  })

  it('removes the pane element from the DOM on dispose', () => {
    const bundle = makePane()
    expect(document.body.contains(bundle.pane.element)).toBe(true)
    bundle.pane.dispose()
    expect(document.body.contains(bundle.pane.element)).toBe(false)
  })

  it('still produces a working stats handle when stats: false', () => {
    const bundle = makePane({ stats: false })
    // Even with stats UI disabled, the stats handle exists and is callable
    expect(() => {
      bundle.stats.begin()
      bundle.stats.end()
      bundle.stats.update({ drawCalls: 1 })
    }).not.toThrow()
  })

  it('disposes the previously unclaimed pane when a second pane is created', () => {
    // The "unclaimed pane" pattern: creating a pane without claiming it leaves
    // it in the orphan slot. The next createPane() call must dispose it before
    // creating its own. This guards against React strict-mode double-mount
    // leaking panes into document.body.
    const first = createPane({ debug: false })
    const firstEl = first.pane.element
    expect(document.body.contains(firstEl)).toBe(true)

    const second = createPane({ debug: false })
    claimPane(second)
    bundles.push(second)

    // First pane should have been auto-disposed and removed from DOM
    expect(document.body.contains(firstEl)).toBe(false)
    expect(document.body.contains(second.pane.element)).toBe(true)
  })
})

// ── wireSceneStats ───────────────────────────────────────────────────────────

interface FakeRenderInfo {
  drawCalls?: number
  triangles?: number
  lines?: number
  points?: number
  calls?: number
  frameCalls?: number
  timestamp?: number
}

interface FakeRenderer {
  info: {
    render: FakeRenderInfo
    memory?: { geometries?: number; textures?: number }
  }
  backend?: {
    trackTimestamp?: boolean
    disjoint?: unknown
    constructor?: { name?: string }
  }
  resolveTimestampsAsync?: (type: 'render' | 'compute') => Promise<number | undefined>
}

function makeStatsHandle(): StatsHandle {
  return {
    begin: vi.fn(),
    end: vi.fn(),
    update: vi.fn(),
    enableGpu: vi.fn(),
    gpuTime: vi.fn(),
  }
}

// Three.js calls scene.onAfterRender with (renderer, scene, camera, ...)
// at the Scene level — different signature from the per-Object3D one.
// We invoke our installed hook with that argument shape.
function fireSceneRender(scene: Scene, renderer: FakeRenderer): void {
  ;(scene.onAfterRender as unknown as (...args: unknown[]) => void)(
    renderer,
    scene,
    null,
    null,
    null,
    null,
  )
}

describe('wireSceneStats', () => {
  let scene: Scene
  let stats: StatsHandle
  let restore: (() => void) | null = null

  beforeEach(() => {
    scene = new Scene()
    stats = makeStatsHandle()
  })

  afterEach(() => {
    restore?.()
    restore = null
  })

  it('replaces scene.onAfterRender with a hook function', () => {
    const original = scene.onAfterRender
    restore = wireSceneStats(scene, stats, { debug: false })
    expect(scene.onAfterRender).not.toBe(original)
    expect(typeof scene.onAfterRender).toBe('function')
  })

  it('forwards renderer.info.render fields to stats.update', () => {
    restore = wireSceneStats(scene, stats, { debug: false })

    fireSceneRender(scene, {
      info: {
        render: {
          drawCalls: 5,
          triangles: 100,
          lines: 2,
          points: 3,
          calls: 5,
          frameCalls: 5,
        },
        memory: { geometries: 7, textures: 11 },
      },
    })

    expect(stats.update).toHaveBeenCalledWith({
      drawCalls: 5,
      triangles: 100,
      lines: 2,
      points: 3,
      geometries: 7,
      textures: 11,
    })
  })

  it('chains the previous onAfterRender hook', () => {
    const previous = vi.fn()
    ;(scene as unknown as { onAfterRender: (...args: unknown[]) => void }).onAfterRender =
      previous

    restore = wireSceneStats(scene, stats, { debug: false })

    fireSceneRender(scene, { info: { render: {} } })

    expect(previous).toHaveBeenCalledTimes(1)
    expect(stats.update).toHaveBeenCalledTimes(1)
  })

  it('restores the previous hook on cleanup', () => {
    const previous = vi.fn()
    ;(scene as unknown as { onAfterRender: (...args: unknown[]) => void }).onAfterRender =
      previous

    const localRestore = wireSceneStats(scene, stats, { debug: false })
    expect(scene.onAfterRender).not.toBe(previous)

    localRestore()
    expect(scene.onAfterRender).toBe(previous)
  })

  it('does not restore if onAfterRender was replaced by another caller', () => {
    const previous = vi.fn()
    ;(scene as unknown as { onAfterRender: (...args: unknown[]) => void }).onAfterRender =
      previous

    const localRestore = wireSceneStats(scene, stats, { debug: false })

    // Some other code installs its own hook on top
    const otherHook = vi.fn()
    ;(scene as unknown as { onAfterRender: (...args: unknown[]) => void }).onAfterRender =
      otherHook

    localRestore()
    // Cleanup must not blow away the unrelated otherHook
    expect(scene.onAfterRender).toBe(otherHook)
  })

  it('enables GPU mode when WebGPU backend exposes trackTimestamp', () => {
    restore = wireSceneStats(scene, stats, { debug: false })

    fireSceneRender(scene, {
      info: { render: { drawCalls: 0 } },
      backend: {
        trackTimestamp: true,
        constructor: { name: 'WebGPUBackend' },
      },
    })

    expect(stats.enableGpu).toHaveBeenCalled()
  })

  it('does not enable GPU mode when WebGL backend lacks the disjoint extension', () => {
    restore = wireSceneStats(scene, stats, { debug: false })

    fireSceneRender(scene, {
      info: { render: { drawCalls: 0 } },
      backend: {
        trackTimestamp: true,
        disjoint: null,
        constructor: { name: 'WebGLBackend' },
      },
    })

    expect(stats.enableGpu).not.toHaveBeenCalled()
  })

  it('does not enable GPU mode when backend trackTimestamp is false', () => {
    restore = wireSceneStats(scene, stats, { debug: false })

    fireSceneRender(scene, {
      info: { render: { drawCalls: 0 } },
      backend: { trackTimestamp: false },
    })

    expect(stats.enableGpu).not.toHaveBeenCalled()
  })

  it('only fires enableGpu once across multiple frames', () => {
    restore = wireSceneStats(scene, stats, { debug: false })

    const renderer: FakeRenderer = {
      info: { render: { drawCalls: 0 } },
      backend: {
        trackTimestamp: true,
        constructor: { name: 'WebGPUBackend' },
      },
    }

    fireSceneRender(scene, renderer)
    fireSceneRender(scene, renderer)
    fireSceneRender(scene, renderer)

    expect(stats.enableGpu).toHaveBeenCalledTimes(1)
  })
})
