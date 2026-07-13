// @vitest-environment happy-dom
import { beforeAll, describe, it } from 'vitest'
import { Object3D, PerspectiveCamera } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Container } from '../index.js'
import { setupA11yProjection } from '../a11y/projection.js'

/**
 * Local projection microbenchmark (logs, does not assert a machine-dependent budget in CI). Measures
 * the PER-FRAME cost the a11y projection adds — `update()` with the projection registered minus the
 * same `update()` with it disposed (layout-only baseline) — for a grid of world-space panels, under a
 * static camera (the common case) and a moving camera. Run: `pnpm exec vitest run a11y-projection-bench`.
 */

beforeAll(async () => {
  await loadYoga()
})

function fakeRenderer() {
  return {
    domElement: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 1000,
        right: 1000,
        bottom: 1000,
      }),
    } as unknown as HTMLElement,
  }
}

function buildScene(n: number) {
  const root = new Container({
    width: 1000,
    height: 1000,
    pixelSize: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  })
  new Object3D().add(root)
  for (let i = 0; i < n; i++) {
    root.add(new Container({ width: 30, height: 18, role: 'button', ariaLabel: `btn ${i}` }))
  }
  const camera = new PerspectiveCamera(60, 1, 0.1, 4000)
  camera.position.set(0, 0, 1400)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  return { root, camera }
}

function timeFrames(fn: () => void, frames: number): number {
  const t0 = performance.now()
  for (let f = 0; f < frames; f++) fn()
  return (performance.now() - t0) / frames
}

// Local measurement tool, not a correctness gate — skipped in CI (heavy happy-dom DOM churn at the
// large sizes, and the numbers are machine-dependent). Correctness lives in a11y-projection.test.ts.
// Run locally: `pnpm exec vitest run a11y-projection-bench`.
describe.skipIf(process.env.CI != null)('a11y projection perf (local log — not a CI gate)', () => {
  it('measures the per-frame projection overhead vs layout-only', { timeout: 120_000 }, () => {
    const FRAMES = 120
    for (const n of [100, 500, 2000]) {
      // Baseline: layout only (no projection registered), members still exist.
      const base = buildScene(n)
      base.root.update(0)
      const layoutOnly = timeFrames(() => base.root.update(16), FRAMES)
      base.root.dispose()

      // With projection.
      const scene = buildScene(n)
      const dispose = setupA11yProjection(scene.root, {
        camera: scene.camera,
        renderer: fakeRenderer(),
      })
      scene.root.update(0) // warm layout + first projection

      const staticFrame = timeFrames(() => scene.root.update(16), FRAMES)
      const movingFrame = timeFrames(() => {
        scene.camera.position.x = Math.sin(performance.now() * 0.01) * 200
        scene.camera.updateMatrixWorld(true)
        scene.root.update(16)
      }, FRAMES)
      dispose()
      scene.root.dispose()

      const staticOverhead = Math.max(0, staticFrame - layoutOnly)
      const movingOverhead = Math.max(0, movingFrame - layoutOnly)
      // eslint-disable-next-line no-console
      console.log(
        `[a11y-perf] N=${String(n).padStart(4)} | layout ${layoutOnly.toFixed(3)}ms | ` +
          `+projection static ${staticOverhead.toFixed(3)}ms (${((staticOverhead * 1000) / n).toFixed(2)}µs/panel) | ` +
          `moving ${movingOverhead.toFixed(3)}ms (${((movingOverhead * 1000) / n).toFixed(2)}µs/panel)`
      )
    }
  })
})
