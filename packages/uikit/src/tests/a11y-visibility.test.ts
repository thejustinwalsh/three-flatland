import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Vector3 } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Container } from '../index.js'
import { classifyA11yVisibility, createRaycastOcclusionProbe } from '../a11y/visibility.js'
import type { Component } from '../components/component.js'

/**
 * Mode-3 perceivability (spec §4.1): classifyA11yVisibility separates what ASSISTIVE TECH can
 * perceive from what the renderer draws. Geometry oracle matches the projection tests: a
 * PerspectiveCamera (fov 90, aspect 1) at z=2 looking at the origin sees 4 world units across the
 * z=0 plane, so with a 100px viewport 1 world unit projects to 25px.
 */

beforeAll(async () => {
  await loadYoga()
})

function makeCamera() {
  const cam = new PerspectiveCamera(90, 1, 0.1, 100)
  cam.position.set(0, 0, 2)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return cam
}

const viewport = { x: 0, y: 0, width: 100, height: 100 }

/**
 * Root-attach a Container under a movable parent and pump one frame so layout (size,
 * globalPanelMatrix, isVisible) settles — same shape as the projection-dom tests' mount.
 */
function mount(
  properties: ConstructorParameters<typeof Container>[0],
  at?: [number, number, number]
): Container {
  const container = new Container(properties)
  const parent = new Object3D()
  if (at != null) {
    parent.position.set(...at)
  }
  parent.add(container)
  container.update(0)
  return container
}

// 100x100 layout px at pixelSize 0.01 → a 1×1 world-unit panel → 25×25 px on screen (> 8px floor).
const visibleProps = { width: 100, height: 100, pixelSize: 0.01 }

describe('classifyA11yVisibility', () => {
  it('classifies an in-frustum fronto-parallel panel projecting 25px as visible', () => {
    const c = mount(visibleProps)
    expect(classifyA11yVisibility(c, makeCamera(), viewport)).toBe('visible')
  })

  it('classifies a panel translated far to the side (rect right of the viewport) as offscreen', () => {
    // Center at x=10 → rect.x ≈ 50 + 9.5·25 = 287.5, entirely right of the 100px viewport.
    const c = mount(visibleProps, [10, 0, 0])
    expect(classifyA11yVisibility(c, makeCamera(), viewport)).toBe('offscreen')
  })

  it('classifies a panel behind the camera (z=10, camera at z=2 facing −z) as behind-camera', () => {
    const c = mount(visibleProps, [0, 0, 10])
    expect(classifyA11yVisibility(c, makeCamera(), viewport)).toBe('behind-camera')
  })

  it('classifies a panel projecting 2.5px (under the default 8px floor) as too-small', () => {
    // pixelSize 0.001 → 0.1 world units → 2.5 screen px.
    const c = mount({ width: 100, height: 100, pixelSize: 0.001 })
    expect(classifyA11yVisibility(c, makeCamera(), viewport)).toBe('too-small')
  })

  it('classifies a 25px panel as too-small when minPerceivableSize is raised above it', () => {
    const c = mount(visibleProps)
    expect(classifyA11yVisibility(c, makeCamera(), viewport, { minPerceivableSize: 30 })).toBe(
      'too-small'
    )
  })

  it('classifies a wide 2px-tall sliver as too-small (smallest extent decides, codex P3 #5)', () => {
    // 200×8 layout px at pixelSize 0.01 → 2×0.08 world units → 50×2 screen px. The 2px height is
    // imperceivable even though the width is huge; min(w,h) must decide, not max(w,h).
    const c = mount({ width: 200, height: 8, pixelSize: 0.01 })
    expect(classifyA11yVisibility(c, makeCamera(), viewport)).toBe('too-small')
  })

  it('a11yVisibilityOverride hidden wins over perfect geometry', () => {
    const c = mount({ ...visibleProps, a11yVisibilityOverride: 'hidden' })
    expect(classifyA11yVisibility(c, makeCamera(), viewport)).toBe('hidden')
  })

  it('a render-invisible panel (visibility hidden) is hidden regardless of geometry', () => {
    const c = mount({ ...visibleProps, visibility: 'hidden' })
    expect(classifyA11yVisibility(c, makeCamera(), viewport)).toBe('hidden')
  })

  it('a11yVisibilityOverride visible force-includes an offscreen panel and skips the probe', () => {
    const probe = vi.fn(() => false)
    const c = mount({ ...visibleProps, a11yVisibilityOverride: 'visible' }, [10, 0, 0])
    expect(classifyA11yVisibility(c, makeCamera(), viewport, { occlusionProbe: probe })).toBe(
      'visible'
    )
    expect(probe).not.toHaveBeenCalled()
  })

  it('a11yVisibilityOverride visible does NOT resurrect a behind-camera panel — no valid rect stays behind-camera (codex system #5)', () => {
    // The override force-includes past the SOFT tests, but a panel that cannot be projected has no
    // screen rect to place the hidden element at, so projection would aria-hide it. The classifier
    // must agree (behind-camera) so the focus manager refuses focus rather than claiming a control the
    // platform can't focus. Probe is never consulted — behind-camera precedes the occlusion check.
    const probe = vi.fn(() => true)
    const c = mount({ ...visibleProps, a11yVisibilityOverride: 'visible' }, [0, 0, 10])
    expect(classifyA11yVisibility(c, makeCamera(), viewport, { occlusionProbe: probe })).toBe(
      'behind-camera'
    )
    expect(probe).not.toHaveBeenCalled()
  })

  it('an occlusionProbe returning false marks a geometrically visible panel occluded', () => {
    const c = mount(visibleProps)
    expect(classifyA11yVisibility(c, makeCamera(), viewport, { occlusionProbe: () => false })).toBe(
      'occluded'
    )
  })

  it('an occlusionProbe returning true leaves the panel visible', () => {
    const c = mount(visibleProps)
    expect(classifyA11yVisibility(c, makeCamera(), viewport, { occlusionProbe: () => true })).toBe(
      'visible'
    )
  })

  it('geometry outranks the probe: an offscreen panel stays offscreen, probe never consulted', () => {
    const probe = vi.fn(() => false)
    const c = mount(visibleProps, [10, 0, 0])
    expect(classifyA11yVisibility(c, makeCamera(), viewport, { occlusionProbe: probe })).toBe(
      'offscreen'
    )
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('createRaycastOcclusionProbe', () => {
  function occluderAt(z: number): Mesh {
    const mesh = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial())
    mesh.position.set(0, 0, z)
    mesh.updateMatrixWorld(true)
    return mesh
  }

  it('defaults to unoccluded (true) before a component was ever checked', () => {
    const { probe } = createRaycastOcclusionProbe(new Object3D())
    const c = mount(visibleProps)
    expect(probe(c)).toBe(true)
  })

  it('reports occluded after onFrame when a mesh sits between the camera and the panel center', () => {
    const scene = new Object3D()
    scene.add(occluderAt(1)) // camera z=2 → occluder at distance 1, panel center at distance 2
    const { probe, onFrame } = createRaycastOcclusionProbe(scene, { camera: makeCamera() })
    const c = mount(visibleProps)
    probe(c) // registers the component for round-robin checking
    onFrame()
    expect(probe(c)).toBe(false)
  })

  it('stays unoccluded with an empty scene', () => {
    const { probe, onFrame } = createRaycastOcclusionProbe(new Object3D(), {
      camera: makeCamera(),
    })
    const c = mount(visibleProps)
    probe(c)
    onFrame()
    expect(probe(c)).toBe(true)
  })

  it('a mesh BEHIND the panel does not occlude it', () => {
    const scene = new Object3D()
    scene.add(occluderAt(-1)) // distance 3 from the camera — past the panel at distance 2
    const { probe, onFrame } = createRaycastOcclusionProbe(scene, { camera: makeCamera() })
    const c = mount(visibleProps)
    probe(c)
    onFrame()
    expect(probe(c)).toBe(true)
  })

  it('checks at most budgetPerFrame components per onFrame, round-robining through all of them', () => {
    const { probe, onFrame } = createRaycastOcclusionProbe(new Object3D(), {
      camera: makeCamera(),
    })
    // Fakes expose exactly what onFrame consumes: a world-center query.
    const fakes = Array.from({ length: 20 }, () => ({
      getWorldPosition: vi.fn((target: Vector3) => target.set(0, 0, 0)),
    }))
    for (const fake of fakes) {
      probe(fake as unknown as Component)
    }

    const checksPerFrame = (): number => {
      const before = fakes.map((f) => f.getWorldPosition.mock.calls.length)
      onFrame()
      return fakes.reduce(
        (sum, f, i) => sum + (f.getWorldPosition.mock.calls.length - before[i]!),
        0
      )
    }

    // Default budget is 8: 20 components take 3 frames for full coverage, never more than 8/frame.
    expect(checksPerFrame()).toBe(8)
    expect(checksPerFrame()).toBe(8)
    expect(checksPerFrame()).toBe(8)
    for (const fake of fakes) {
      expect(fake.getWorldPosition.mock.calls.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('honors an explicit budgetPerFrame', () => {
    const { probe, onFrame } = createRaycastOcclusionProbe(new Object3D(), {
      camera: makeCamera(),
      budgetPerFrame: 2,
    })
    const fakes = Array.from({ length: 5 }, () => ({
      getWorldPosition: vi.fn((target: Vector3) => target.set(0, 0, 0)),
    }))
    for (const fake of fakes) {
      probe(fake as unknown as Component)
    }
    onFrame()
    expect(fakes.reduce((sum, f) => sum + f.getWorldPosition.mock.calls.length, 0)).toBe(2)
  })

  it('does nothing without a camera — every probe stays at the unoccluded default', () => {
    const scene = new Object3D()
    scene.add(occluderAt(1))
    const { probe, onFrame } = createRaycastOcclusionProbe(scene)
    const c = mount(visibleProps)
    probe(c)
    onFrame()
    expect(probe(c)).toBe(true)
  })

  it('prunes a disposed (aborted) component so it is no longer retained or raycast (codex system #10)', () => {
    const { probe, onFrame } = createRaycastOcclusionProbe(new Object3D(), { camera: makeCamera() })
    const makeFake = (signal: AbortSignal) => ({
      abortSignal: signal,
      getWorldPosition: vi.fn((target: Vector3) => target.set(0, 0, 0)),
    })
    const live = makeFake(new AbortController().signal)
    const deadController = new AbortController()
    const dead = makeFake(deadController.signal)
    probe(live as unknown as Component)
    probe(dead as unknown as Component)
    // The subtree tears down: its abort fires. Next frame must drop it BEFORE raycasting.
    deadController.abort()
    onFrame()
    expect(dead.getWorldPosition).not.toHaveBeenCalled()
    expect(live.getWorldPosition).toHaveBeenCalledTimes(1)
  })

  it('dispose() releases registered components so the round-robin runs empty afterward', () => {
    const { probe, onFrame, dispose } = createRaycastOcclusionProbe(new Object3D(), {
      camera: makeCamera(),
    })
    const fake = {
      abortSignal: new AbortController().signal,
      getWorldPosition: vi.fn((target: Vector3) => target.set(0, 0, 0)),
    }
    probe(fake as unknown as Component)
    dispose()
    onFrame()
    expect(fake.getWorldPosition).not.toHaveBeenCalled()
  })
})
