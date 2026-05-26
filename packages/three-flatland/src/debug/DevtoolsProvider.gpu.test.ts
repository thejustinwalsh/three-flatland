import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebGPURenderer } from 'three/webgpu'
import { DevtoolsProvider } from './DevtoolsProvider'

/**
 * Live GPU-timestamp toggling. The provider owns `backend.trackTimestamp`
 * and drives it off the `stats` subscription: on while the dashboard/pane
 * is expanded (subscribed to stats), off when collapsed (no subscribers).
 * Turning it off stops three from issuing timestamp queries, so the pool
 * never fills with entries nobody drains; turning it back on resumes.
 *
 * These exercise the real `beginFrame` path + the real subscriber registry,
 * so they catch a regression in the wiring (not just the decision helper).
 */

interface MockBackend {
  trackTimestamp: boolean
  constructor: { name: string }
  device?: { features: Set<string> }
}

function mockRenderer(backend: MockBackend): {
  renderer: WebGPURenderer
  resolveTimestampsAsync: ReturnType<typeof vi.fn>
} {
  const resolveTimestampsAsync = vi.fn(async () => 0)
  const renderer = {
    info: { render: { calls: 0, triangles: 0, lines: 0, points: 0 } },
    backend,
    resolveTimestampsAsync,
  } as unknown as WebGPURenderer
  return { renderer, resolveTimestampsAsync }
}

/** WebGPU backend whose device negotiated `timestamp-query`. */
function supportedBackend(): MockBackend {
  return {
    trackTimestamp: false,
    constructor: { name: 'WebGPUBackend' },
    device: { features: new Set(['timestamp-query']) },
  }
}

let active: DevtoolsProvider | null = null

function makeProvider(suffix: string): DevtoolsProvider {
  const p = new DevtoolsProvider({
    id: `gpu-test-${suffix}`,
    discoveryChannelName: `flatland-debug-gpu-test-${suffix}`,
  })
  p.start()
  active = p
  return p
}

afterEach(() => {
  active?.dispose()
  active = null
})

describe('DevtoolsProvider GPU-timing toggle', () => {
  it('leaves timing off while nobody is subscribed to stats', () => {
    const provider = makeProvider('idle')
    const backend = supportedBackend()
    const { renderer, resolveTimestampsAsync } = mockRenderer(backend)

    provider.beginFrame(performance.now(), renderer)
    expect(backend.trackTimestamp).toBe(false)
    // No transition happened, so nothing to drain.
    expect(resolveTimestampsAsync).not.toHaveBeenCalled()
  })

  it('enables timing when a consumer subscribes to stats, disables on unsubscribe', () => {
    const provider = makeProvider('resume')
    const backend = supportedBackend()
    const { renderer } = mockRenderer(backend)

    // Collapsed: no subscribers → off.
    provider.beginFrame(performance.now(), renderer)
    expect(backend.trackTimestamp).toBe(false)

    // Expanded: stats subscriber arrives → on.
    provider.subscribers.onSubscribe('consumer-a', ['stats'])
    provider.beginFrame(performance.now(), renderer)
    expect(backend.trackTimestamp).toBe(true)

    // Collapsed again: subscriber leaves → back off (stop sampling).
    provider.subscribers.onUnsubscribe('consumer-a')
    provider.beginFrame(performance.now(), renderer)
    expect(backend.trackTimestamp).toBe(false)

    // Expanded again: resume.
    provider.subscribers.onSubscribe('consumer-b', ['stats'])
    provider.beginFrame(performance.now(), renderer)
    expect(backend.trackTimestamp).toBe(true)
  })

  it('drains the query pool before turning timing off, while still tracking', () => {
    const provider = makeProvider('drain')
    const backend = supportedBackend()
    const { renderer, resolveTimestampsAsync } = mockRenderer(backend)

    // Turn on.
    provider.subscribers.onSubscribe('consumer-a', ['stats'])
    provider.beginFrame(performance.now(), renderer)
    expect(backend.trackTimestamp).toBe(true)
    expect(resolveTimestampsAsync).not.toHaveBeenCalled()

    // Turn off: a final drain fires (the resolve path needs trackTimestamp
    // still true), then the flag clears.
    resolveTimestampsAsync.mockImplementation(async () => {
      // At drain time, tracking must still be enabled — otherwise three's
      // backend.resolveTimestampsAsync would no-op and warn.
      expect(backend.trackTimestamp).toBe(true)
      return 0
    })
    provider.subscribers.onUnsubscribe('consumer-a')
    provider.beginFrame(performance.now(), renderer)
    expect(resolveTimestampsAsync).toHaveBeenCalledOnce()
    expect(resolveTimestampsAsync).toHaveBeenCalledWith('render')
    expect(backend.trackTimestamp).toBe(false)
  })

  it('ignores subscriptions that do not include stats', () => {
    const provider = makeProvider('non-stats')
    const backend = supportedBackend()
    const { renderer } = mockRenderer(backend)

    provider.subscribers.onSubscribe('consumer-buffers', ['buffers', 'registry'])
    provider.beginFrame(performance.now(), renderer)
    expect(backend.trackTimestamp).toBe(false)
  })

  it('never enables on a backend without timestamp support, even when wanted', () => {
    const provider = makeProvider('unsupported')
    const backend: MockBackend = {
      trackTimestamp: false,
      constructor: { name: 'WebGPUBackend' },
      device: { features: new Set<string>() },
    }
    const { renderer } = mockRenderer(backend)

    provider.subscribers.onSubscribe('consumer-a', ['stats'])
    provider.beginFrame(performance.now(), renderer)
    expect(backend.trackTimestamp).toBe(false)
  })
})
