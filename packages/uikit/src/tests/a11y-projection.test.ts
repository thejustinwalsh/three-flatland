import { describe, expect, it } from 'vitest'
import { Matrix4, PerspectiveCamera } from 'three'
import { computeA11yScreenRect } from '../a11y/projection.js'
import type { A11yViewport } from '../a11y/projection.js'

/**
 * Oracle values computed by three.js itself (PerspectiveCamera 90deg fov, aspect 1, at z=2 looking
 * at origin). The panelWorldMatrix maps the UNIT quad (corners at +/-0.5, z=0) to world space —
 * size x pixelSize is already baked in, so a 2x2 world-unit panel is makeScale(2, 2, 1).
 */

function makeCamera() {
  const cam = new PerspectiveCamera(90, 1, 0.1, 100)
  cam.position.set(0, 0, 2)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return cam
}

const viewport: A11yViewport = { x: 0, y: 0, width: 100, height: 100 }

function expectRectClose(
  actual: { x: number; y: number; w: number; h: number } | null,
  expected: { x: number; y: number; w: number; h: number }
) {
  expect(actual).not.toBeNull()
  expect(Math.abs(actual!.x - expected.x)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(actual!.y - expected.y)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(actual!.w - expected.w)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(actual!.h - expected.h)).toBeLessThanOrEqual(0.5)
}

describe('computeA11yScreenRect', () => {
  it('O1: projects a fronto-parallel 2x2 panel to the centered half-viewport rect', () => {
    const cam = makeCamera()
    const panel = new Matrix4().makeScale(2, 2, 1)
    expectRectClose(computeA11yScreenRect(panel, cam, viewport), { x: 25, y: 25, w: 50, h: 50 })
  })

  it('O3: projects a panel tilted 60deg around Y', () => {
    const cam = makeCamera()
    const panel = new Matrix4()
      .makeRotationY(Math.PI / 3)
      .multiply(new Matrix4().makeScale(2, 2, 1))
    expectRectClose(computeA11yScreenRect(panel, cam, viewport), {
      x: 27.954,
      y: 5.907,
      w: 30.769,
      h: 88.185,
    })
  })

  it('O3b: projects a panel tilted 30deg around Y', () => {
    const cam = makeCamera()
    const panel = new Matrix4()
      .makeRotationY(Math.PI / 6)
      .multiply(new Matrix4().makeScale(2, 2, 1))
    expectRectClose(computeA11yScreenRect(panel, cam, viewport), {
      x: 21.132,
      y: 16.667,
      w: 46.188,
      h: 66.667,
    })
  })

  it('O2: returns null when the panel is behind the camera', () => {
    const cam = makeCamera()
    const panel = new Matrix4().makeTranslation(0, 0, 10).multiply(new Matrix4().makeScale(2, 2, 1))
    expect(computeA11yScreenRect(panel, cam, viewport)).toBeNull()
  })

  it('offsets the rect by the viewport page position', () => {
    const cam = makeCamera()
    const offsetViewport: A11yViewport = { x: 50, y: 30, width: 100, height: 100 }
    const panel = new Matrix4().makeScale(2, 2, 1)
    expectRectClose(computeA11yScreenRect(panel, cam, offsetViewport), {
      x: 75,
      y: 55,
      w: 50,
      h: 50,
    })
  })

  it('perf: 200 calls stay within the frame budget (asserted locally, logged in CI)', () => {
    const cam = makeCamera()
    const panel = new Matrix4()
      .makeRotationY(Math.PI / 6)
      .multiply(new Matrix4().makeScale(2, 2, 1))
    // warmup
    for (let i = 0; i < 1000; i++) {
      computeA11yScreenRect(panel, cam, viewport)
    }
    const iterations = 500
    const callsPerIteration = 200
    const start = performance.now()
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < callsPerIteration; i++) {
        computeA11yScreenRect(panel, cam, viewport)
      }
    }
    const avgMsPer200Calls = (performance.now() - start) / iterations
    // eslint-disable-next-line no-console
    console.log(
      `computeA11yScreenRect: ${avgMsPer200Calls.toFixed(4)} ms per 200 calls (avg of ${iterations})`
    )
    if (process.env.CI == null) {
      expect(avgMsPer200Calls).toBeLessThanOrEqual(0.2)
    }
  })
})
