import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Object3D, PerspectiveCamera } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Container } from '../index.js'
import { computeSpatialOrder, focusDirectional } from '../a11y/spatial-nav.js'
import type { SpatialNavContext } from '../a11y/spatial-nav.js'

/**
 * Spatial navigation ordering (spec §4.2) with hand-derived expectations. Fixed geometry:
 * PerspectiveCamera(90, 1) at (0,0,5) looking at the origin, viewport 100×100 px. With fov 90 and
 * aspect 1 a world point (wx, wy, wz) fronto-parallel to the camera projects to
 *   sx = 50 + 50·wx/(5−wz),  sy = 50 − 50·wy/(5−wz)
 * Every panel is a 100×100 px root Container (pixelSize 0.01 → a 1×1 world-unit quad centered on
 * its `position`), so projected centers equal the projected world positions above.
 */

beforeAll(async () => {
  await loadYoga()
})

const disposables: Array<Container> = []

afterEach(() => {
  for (const c of disposables) {
    c.dispose()
  }
  disposables.length = 0
})

/**
 * Camera at (cameraX, 0, 5) looking straight down −Z — a pure lateral truck when cameraX changes
 * (re-aiming at the origin would rotate the camera and cancel most of the projected movement the
 * hysteresis tests rely on).
 */
function makeContext(cameraX = 0): SpatialNavContext {
  const camera = new PerspectiveCamera(90, 1, 0.1, 100)
  camera.position.set(cameraX, 0, 5)
  camera.lookAt(cameraX, 0, 0)
  camera.updateMatrixWorld(true)
  return { camera, viewport: { x: 0, y: 0, width: 100, height: 100 } }
}

/** A 100×100 px root panel centered at the given world position, laid out and root-attached. */
function panelAt(
  x: number,
  y: number,
  z: number,
  props?: ConstructorParameters<typeof Container>[0]
): Container {
  const container = new Container({ width: 100, height: 100, ...props })
  container.position.set(x, y, z)
  new Object3D().add(container)
  container.update(16)
  disposables.push(container)
  return container
}

describe('computeSpatialOrder', () => {
  it('sorts groups by camera distance, members by projected reading order (rows, then x)', () => {
    const ctx = makeContext()
    // 'hud' group at z=2 (distance ~3): one panel on a top row, two on a lower row.
    const nTop = panelAt(0, 2, 2, { a11yGroup: 'hud' }) // center (50, 16.7)
    const nLeft = panelAt(-2, 0, 2, { a11yGroup: 'hud' }) // center (16.7, 50)
    const nRight = panelAt(2, 0, 2, { a11yGroup: 'hud' }) // center (83.3, 50)
    // 'wall' group at z=-3 (distance 8): farther, so its group sorts after 'hud'.
    const far = panelAt(0, 0, -3, { a11yGroup: 'wall' })

    const order = computeSpatialOrder([far, nRight, nTop, nLeft], ctx)
    expect(order).toEqual([nTop, nLeft, nRight, far])
  })

  it('a11yOrder overrides projected reading order within a group', () => {
    const ctx = makeContext()
    const a = panelAt(-2, 0, 0, { a11yOrder: 2 }) // reading order first (center (30, 50))
    const b = panelAt(2, 0, 0, { a11yOrder: 1 }) // reading order second (center (70, 50))
    const c = panelAt(0, -2, 0) // no explicit order, lower row (center (50, 70))

    // Explicitly ordered members come first (ascending a11yOrder), then reading order.
    const order = computeSpatialOrder([a, c, b], ctx)
    expect(order).toEqual([b, a, c])
  })

  it('members inherit the nearest landmark ancestor group', () => {
    const ctx = makeContext()
    // A landmark root at z=2 with two laid-out children (default row layout → c1 left of c2).
    const cockpit = panelAt(0, 0, 2, { role: 'landmark', ariaLabel: 'Cockpit' })
    const c1 = new Container({ width: 40, height: 40 })
    const c2 = new Container({ width: 40, height: 40 })
    cockpit.add(c1, c2)
    cockpit.update(16)
    // A far panel in its own explicit group at z=-3 (distance 8 > Cockpit's ~3).
    const far = panelAt(0, 0, -3, { a11yGroup: 'wall' })

    const order = computeSpatialOrder([far, c2, c1], ctx)
    expect(order).toEqual([c1, c2, far])
  })

  it('behind-camera components sort last, keeping their input order', () => {
    const ctx = makeContext()
    const behindB = panelAt(0, 0, 9) // behind the camera plane → unprojectable
    const front = panelAt(0, 0, 0)
    const behindA = panelAt(0, 0, 12)

    const order = computeSpatialOrder([behindB, front, behindA], ctx)
    expect(order).toEqual([front, behindB, behindA])
  })

  describe('hysteresis', () => {
    // Two single-member groups at nearly equal camera distance: a small lateral camera move flips
    // which group is nearer while every projected center moves only ~5 px.
    function makeScene() {
      const p1 = panelAt(-1, 0, 0.01, { a11yGroup: 'g1' }) // dist 5.089 from (0,0,5)
      const p2 = panelAt(1, 0, -0.01, { a11yGroup: 'g2' }) // dist 5.109 from (0,0,5)
      return { p1, p2 }
    }

    it('keeps the previous order across a sub-threshold camera move', () => {
      const { p1, p2 } = makeScene()
      const first = computeSpatialOrder([p2, p1], makeContext(0))
      expect(first).toEqual([p1, p2])

      // Camera x 0 → 0.5: fresh distances now favor g2 (5.211 vs 5.035), but every projected
      // center moved only ~5 px < 24 px, so the previous order must be kept.
      const second = computeSpatialOrder([p2, p1], makeContext(0.5), { previousOrder: first })
      expect(second).toEqual([p1, p2])
    })

    it('reshuffles once a projected center moves past the threshold', () => {
      const { p1, p2 } = makeScene()
      const first = computeSpatialOrder([p2, p1], makeContext(0))
      expect(first).toEqual([p1, p2])

      // Camera x 0 → 3: projected centers moved ~30 px > 24 px from the recorded baseline, so the
      // fresh order (g2 nearer: 5.39 vs 6.40) wins.
      const third = computeSpatialOrder([p2, p1], makeContext(3), { previousOrder: first })
      expect(third).toEqual([p2, p1])
    })

    it('honors a custom hysteresisPx threshold', () => {
      const { p1, p2 } = makeScene()
      const first = computeSpatialOrder([p2, p1], makeContext(0))

      // The same ~5 px move reshuffles when the threshold is tightened below it.
      const second = computeSpatialOrder([p2, p1], makeContext(0.5), {
        previousOrder: first,
        hysteresisPx: 2,
      })
      expect(second).toEqual([p2, p1])
    })
  })
})

describe('focusDirectional', () => {
  // A plus/cross layout on the z=0 plane: projected centers
  // C (50,50), L (30,50), R (70,50), U (50,30), D (50,70).
  function makeCross() {
    const center = panelAt(0, 0, 0)
    const left = panelAt(-2, 0, 0)
    const right = panelAt(2, 0, 0)
    const up = panelAt(0, 2, 0)
    const down = panelAt(0, -2, 0)
    return { center, left, right, up, down, all: [center, left, right, up, down] }
  }

  it('picks the neighbor in each requested half-plane from the current component', () => {
    const ctx = makeContext()
    const { center, left, right, up, down, all } = makeCross()
    expect(focusDirectional(all, center, 'left', ctx)).toBe(left)
    expect(focusDirectional(all, center, 'right', ctx)).toBe(right)
    expect(focusDirectional(all, center, 'up', ctx)).toBe(up)
    expect(focusDirectional(all, center, 'down', ctx)).toBe(down)
  })

  it('returns undefined when no component lies in the requested half-plane', () => {
    const ctx = makeContext()
    const { left, all } = makeCross()
    expect(focusDirectional(all, left, 'left', ctx)).toBeUndefined()
  })

  it('starts from the viewport center when no current component is given', () => {
    const ctx = makeContext()
    const { left, all } = makeCross()
    // From (50,50) only L has a projected center strictly left of the origin.
    expect(focusDirectional(all, undefined, 'left', ctx)).toBe(left)
  })
})
