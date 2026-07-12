// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Object3D, PerspectiveCamera } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Container } from '../index.js'
import { computeA11yScreenRect, setupA11yProjection } from '../a11y/projection.js'
import { setA11yDebug } from '../a11y/debug.js'
import { getRootA11yContainer, getRootA11yMembers } from '../a11y/hidden-element.js'

/**
 * Mode 2 projection integration through a real Container root: setupA11yProjection enumerates the
 * per-root member registry, refreshes matrices each frame, and writes each hidden element's transform
 * to exactly what the (independently oracle-tested) computeA11yScreenRect produces — hiding it when
 * the panel is off-frustum, and restoring the off-screen container on dispose.
 */

beforeAll(async () => {
  await loadYoga()
})

afterEach(() => {
  for (const el of document.querySelectorAll('[data-uikit-a11y]')) {
    el.remove()
  }
})

function mount(properties: ConstructorParameters<typeof Container>[0]): Container {
  const container = new Container(properties)
  new Object3D().add(container)
  return container
}

function facingCamera() {
  const cam = new PerspectiveCamera(90, 1, 0.1, 100)
  cam.position.set(0, 0, 2)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return cam
}

// A stand-in renderer exposing only the on-page canvas rect the projection reads.
function fakeRenderer(rect: { left: number; top: number; width: number; height: number }) {
  return {
    domElement: {
      getBoundingClientRect: () => ({
        ...rect,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
      }),
    } as unknown as HTMLElement,
  }
}

describe('setupA11yProjection', () => {
  it('positions the hidden element over the panel with the math-core rect', () => {
    const c = mount({ width: 100, height: 100, pixelSize: 0.01, role: 'button', ariaLabel: 'Go' })
    const camera = facingCamera()
    const viewport = { x: 0, y: 0, width: 100, height: 100 }
    const dispose = setupA11yProjection(c, {
      camera,
      renderer: fakeRenderer({ left: 0, top: 0, width: 100, height: 100 }),
    })
    try {
      const root = c.root.peek()

      c.update(0) // pump the frame (projection runs in onFrameEndSet)

      // The container flips from the off-screen fallback to a canvas overlay once projection runs.
      expect(getRootA11yContainer(root)!.style.position).toBe('fixed')

      // Independently recompute the expected rect from the same matrix the projection used.
      c.updateWorldMatrix(true, false)
      const expected = computeA11yScreenRect(c.matrixWorld, camera, viewport)
      expect(expected).not.toBeNull()

      const el = c.a11yElement!
      expect(el.style.visibility).not.toBe('hidden')
      expect(el.style.transform).toBe(`translate(${expected!.x}px, ${expected!.y}px)`)
      expect(el.style.width).toBe(`${expected!.w}px`)
      expect(el.style.height).toBe(`${expected!.h}px`)
    } finally {
      dispose()
      c.dispose()
    }
  })

  it('offsets by the canvas page position', () => {
    const c = mount({ width: 100, height: 100, pixelSize: 0.01, role: 'button', ariaLabel: 'Go' })
    const camera = facingCamera()
    const dispose = setupA11yProjection(c, {
      camera,
      renderer: fakeRenderer({ left: 40, top: 25, width: 100, height: 100 }),
    })
    try {
      c.update(0)
      c.updateWorldMatrix(true, false)
      const expected = computeA11yScreenRect(c.matrixWorld, camera, {
        x: 40,
        y: 25,
        width: 100,
        height: 100,
      })
      expect(expected).not.toBeNull()
      expect(c.a11yElement!.style.transform).toBe(`translate(${expected!.x}px, ${expected!.y}px)`)
    } finally {
      dispose()
      c.dispose()
    }
  })

  it('hides the element when the panel is behind the camera', () => {
    const c = mount({ width: 100, height: 100, pixelSize: 0.01, role: 'button', ariaLabel: 'Go' })
    // Camera behind the panel, looking away — every corner is behind the camera plane.
    const camera = new PerspectiveCamera(90, 1, 0.1, 100)
    camera.position.set(0, 0, -2)
    camera.lookAt(0, 0, -10)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
    const dispose = setupA11yProjection(c, {
      camera,
      renderer: fakeRenderer({ left: 0, top: 0, width: 100, height: 100 }),
    })
    try {
      c.update(0)
      expect(c.a11yElement!.style.visibility).toBe('hidden')
    } finally {
      dispose()
      c.dispose()
    }
  })

  it('restores the off-screen container fallback on dispose', () => {
    const c = mount({ width: 100, height: 100, role: 'button', ariaLabel: 'Go' })
    const camera = facingCamera()
    const root = c.root.peek()
    const dispose = setupA11yProjection(c, {
      camera,
      renderer: fakeRenderer({ left: 0, top: 0, width: 100, height: 100 }),
    })
    c.update(0)
    expect(getRootA11yContainer(root)!.style.position).toBe('fixed')
    dispose()
    expect(getRootA11yContainer(root)!.style.left).toBe('-1000vw')
    c.dispose()
  })

  it('hides the element for a visibility:hidden panel instead of projecting it (codex #1)', () => {
    const c = mount({
      width: 100,
      height: 100,
      pixelSize: 0.01,
      role: 'button',
      ariaLabel: 'Go',
      visibility: 'hidden',
    })
    const camera = facingCamera()
    const dispose = setupA11yProjection(c, {
      camera,
      renderer: fakeRenderer({ left: 0, top: 0, width: 100, height: 100 }),
    })
    try {
      c.update(0)
      // Not visible → not a tab target this frame, even though the panel is in front of the camera.
      expect(c.a11yElement!.style.visibility).toBe('hidden')
    } finally {
      dispose()
      c.dispose()
    }
  })

  it('drops a component from the member registry when it is disposed', () => {
    const c = mount({ width: 100, height: 100, role: 'button', ariaLabel: 'Go' })
    const root = c.root.peek()
    expect(getRootA11yMembers(root)?.has(c)).toBe(true)
    c.dispose()
    expect(getRootA11yMembers(root)?.has(c) ?? false).toBe(false)
  })
})

/** Root-attaches a world-space Container under a wrapper at a given world position (Mode 3). */
function mountAt(
  properties: ConstructorParameters<typeof Container>[0],
  position: [number, number, number]
): Container {
  const container = new Container(properties)
  const wrapper = new Object3D()
  wrapper.position.set(...position)
  wrapper.add(container)
  wrapper.updateMatrixWorld(true)
  return container
}

describe('setupA11yProjection — Mode 3 visibility policy', () => {
  const viewportRenderer = () => fakeRenderer({ left: 0, top: 0, width: 100, height: 100 })

  it('a visible world-space panel stays focusable and not aria-hidden', () => {
    const c = mount({ width: 100, height: 100, pixelSize: 0.01, role: 'button', ariaLabel: 'Go' })
    const dispose = setupA11yProjection(c, { camera: facingCamera(), renderer: viewportRenderer() })
    try {
      c.update(0)
      const el = c.a11yElement!
      expect(el.hasAttribute('aria-hidden')).toBe(false)
      expect(el.tabIndex).toBe(0)
      expect(el.style.visibility).not.toBe('hidden')
    } finally {
      dispose()
      c.dispose()
    }
  })

  it('a panel far off to the side → offscreen: skipped by Tab (tabIndex -1) but still exposed', () => {
    const c = mountAt(
      { width: 100, height: 100, pixelSize: 0.01, role: 'button', ariaLabel: 'Go' },
      [20, 0, 0]
    )
    const dispose = setupA11yProjection(c, { camera: facingCamera(), renderer: viewportRenderer() })
    try {
      c.update(0)
      const el = c.a11yElement!
      expect(el.hasAttribute('aria-hidden')).toBe(false)
      expect(el.tabIndex).toBe(-1)
    } finally {
      dispose()
      c.dispose()
    }
  })

  it('a panel behind the camera → aria-hidden and hidden (not perceivable)', () => {
    const c = mountAt(
      { width: 100, height: 100, pixelSize: 0.01, role: 'button', ariaLabel: 'Go' },
      [0, 0, 10]
    )
    const dispose = setupA11yProjection(c, { camera: facingCamera(), renderer: viewportRenderer() })
    try {
      c.update(0)
      const el = c.a11yElement!
      expect(el.getAttribute('aria-hidden')).toBe('true')
      expect(el.style.visibility).toBe('hidden')
    } finally {
      dispose()
      c.dispose()
    }
  })
})

describe('setupA11yProjection — visibility teardown (codex P3 #3)', () => {
  it('clears focus-skip + aria-hidden on dispose so a Mode-1 fallback stays tabbable', () => {
    // Offscreen → the policy sets tabIndex -1 (focus-skip).
    const c = mountAt(
      { width: 100, height: 100, pixelSize: 0.01, role: 'button', ariaLabel: 'Go' },
      [20, 0, 0]
    )
    const dispose = setupA11yProjection(c, {
      camera: facingCamera(),
      renderer: fakeRenderer({ left: 0, top: 0, width: 100, height: 100 }),
    })
    c.update(0)
    const el = c.a11yElement!
    expect(el.tabIndex).toBe(-1)
    // Teardown must restore focusability — otherwise the hidden element is untabbable forever.
    dispose()
    expect(el.tabIndex).toBe(0)
    expect(el.hasAttribute('aria-hidden')).toBe(false)
    c.dispose()
  })

  it('clears projection-owned visibility:hidden on dispose so a behind-camera member rejoins the a11y tree (codex P3-round2 #5)', () => {
    // Behind the camera → the policy sets aria-hidden AND visibility:hidden.
    const c = mountAt(
      { width: 100, height: 100, pixelSize: 0.01, role: 'button', ariaLabel: 'Go' },
      [0, 0, 10]
    )
    const dispose = setupA11yProjection(c, {
      camera: facingCamera(),
      renderer: fakeRenderer({ left: 0, top: 0, width: 100, height: 100 }),
    })
    c.update(0)
    const el = c.a11yElement!
    expect(el.style.visibility).toBe('hidden')
    expect(el.getAttribute('aria-hidden')).toBe('true')
    // visibility:hidden prunes the element from the accessibility tree; teardown must strip it, or the
    // advertised Mode-1 fallback stays invisible to assistive tech.
    dispose()
    expect(el.style.visibility).toBe('')
    expect(el.hasAttribute('aria-hidden')).toBe(false)
    c.dispose()
  })

  it('resets focus-skip when the a11y element is torn down, so a re-added role is not stuck tabIndex -1 (codex P3-round2 #6)', () => {
    // Offscreen → projection focus-skips the panel (tabIndex -1).
    const c = mountAt(
      { width: 100, height: 100, pixelSize: 0.01, role: 'button', ariaLabel: 'Go' },
      [20, 0, 0]
    )
    const dispose = setupA11yProjection(c, {
      camera: facingCamera(),
      renderer: fakeRenderer({ left: 0, top: 0, width: 100, height: 100 }),
    })
    c.update(0)
    expect(c.a11yElement!.tabIndex).toBe(-1)

    // Remove the role → the hidden element is torn down while focus-skip is still set. The projection
    // TRACKED this component when it skipped it, so even though it is no longer a member, disposal
    // still resets its focus-skip — ownership outlives the element incarnation.
    c.setProperties({ role: undefined })
    c.update(0)
    expect(c.a11yElement).toBeUndefined()
    dispose()

    // Re-add the role (projection gone) → a FRESH element with the default tabIndex 0, not a stale -1.
    c.setProperties({ role: 'button', ariaLabel: 'Go' })
    c.update(0)
    expect(c.a11yElement!.tabIndex).toBe(0)
    c.dispose()
  })

  it('keeps focus-skip across a role remove+re-add while the projection is STILL active (codex P3-round3 #4)', () => {
    const c = mountAt(
      { width: 100, height: 100, pixelSize: 0.01, role: 'button', ariaLabel: 'Go' },
      [20, 0, 0]
    )
    const dispose = setupA11yProjection(c, {
      camera: facingCamera(),
      renderer: fakeRenderer({ left: 0, top: 0, width: 100, height: 100 }),
    })
    c.update(0)
    expect(c.a11yElement!.tabIndex).toBe(-1)

    // Remove then re-add the role WITHOUT disposing the projection or pumping a frame in between: the
    // projection still owns the skip, so the fresh element must NOT be momentarily tabbable — resetting
    // focus-skip on element teardown would open exactly that Tab-reachable window.
    c.setProperties({ role: undefined })
    c.update(0)
    c.setProperties({ role: 'button', ariaLabel: 'Go' })
    expect(c.a11yElement!.tabIndex).toBe(-1)

    dispose()
    c.dispose()
  })
})

describe('setupA11yProjection — debug overlay', () => {
  it('reveals a visible member (opacity + outline + role/name label) when debug is on, restores it off', () => {
    const c = mount({ width: 100, height: 100, pixelSize: 0.01, role: 'button', ariaLabel: 'Go' })
    const dispose = setupA11yProjection(c, {
      camera: facingCamera(),
      renderer: fakeRenderer({ left: 0, top: 0, width: 100, height: 100 }),
    })
    try {
      const el = c.a11yElement!
      c.update(0)
      // Hidden by default — the a11y element is opacity:0 and carries no debug marker.
      expect(el.style.opacity).toBe('0')
      expect(el.hasAttribute('data-a11y-debug')).toBe(false)

      setA11yDebug(true)
      c.update(0)
      expect(el.style.opacity).toBe('1')
      expect(el.style.outline).not.toBe('')
      expect(el.getAttribute('data-a11y-debug')).toContain('button')
      expect(el.getAttribute('data-a11y-debug')).toContain('Go')
      expect(el.title).toContain('Go')

      setA11yDebug(false)
      c.update(0)
      expect(el.style.opacity).toBe('0')
      expect(el.hasAttribute('data-a11y-debug')).toBe(false)
      expect(el.style.outline).toBe('')
    } finally {
      setA11yDebug(false)
      dispose()
      c.dispose()
    }
  })
})
