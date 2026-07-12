// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Object3D, PerspectiveCamera } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Container } from '../index.js'
import { A11yFocusManager } from '../a11y/focus-manager.js'
import { createSwitchScan, type SwitchScanController } from '../a11y/adapters/switch-scan.js'

/**
 * SWITCH-SCAN adapter (Phase 3 T3.4) over a real A11yFocusManager + real Container components.
 * Geometry mirrors a11y-focus-manager.test.ts: one 400×400 px root (pixelSize 0.01) holding three
 * absolutely-positioned 100×100 px buttons at (50,150) / (150,150) / (250,150) — all inside the
 * 100×100 px viewport, so all three are 'visible' and reachable in that order via focusNext().
 */

beforeAll(async () => {
  await loadYoga()
})

const disposables: Array<Container> = []
const managers: Array<A11yFocusManager> = []
const scans: Array<SwitchScanController> = []

afterEach(() => {
  vi.useRealTimers()
  for (const scan of scans) {
    scan.dispose()
  }
  scans.length = 0
  for (const manager of managers) {
    manager.dispose()
  }
  managers.length = 0
  for (const component of disposables) {
    component.dispose()
  }
  disposables.length = 0
  for (const el of document.querySelectorAll('[data-uikit-a11y]')) {
    el.remove()
  }
})

const VIEWPORT = { x: 0, y: 0, width: 100, height: 100 }

function makeCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(90, 1, 0.1, 100)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  return camera
}

function makeScene() {
  const root = new Container({ width: 400, height: 400, pixelSize: 0.01 })
  new Object3D().add(root)
  disposables.push(root)
  const child = (positionLeft: number, positionTop: number, ariaLabel: string): Container => {
    const component = new Container({
      width: 100,
      height: 100,
      positionType: 'absolute',
      positionLeft,
      positionTop,
      role: 'button',
      ariaLabel,
    })
    root.add(component)
    disposables.push(component)
    root.update(16)
    return component
  }
  const a = child(50, 150, 'A')
  const b = child(150, 150, 'B')
  const c = child(250, 150, 'C')
  return { root, a, b, c }
}

function makeManager(root: Container): A11yFocusManager {
  const manager = new A11yFocusManager(root, { camera: makeCamera(), viewport: VIEWPORT })
  managers.push(manager)
  return manager
}

function track(scan: SwitchScanController): SwitchScanController {
  scans.push(scan)
  return scan
}

describe('auto-advance', () => {
  it('moves focus to the first focusable after one interval, then walks in manager order', () => {
    vi.useFakeTimers()
    const { root, a, b, c } = makeScene()
    const manager = makeManager(root)
    track(createSwitchScan(manager, { autoStart: true, intervalMs: 1000 }))

    expect(manager.focused.value).toBeUndefined()
    vi.advanceTimersByTime(1000)
    expect(manager.focused.value).toBe(a)
    vi.advanceTimersByTime(1000)
    expect(manager.focused.value).toBe(b)
    vi.advanceTimersByTime(1000)
    expect(manager.focused.value).toBe(c)
  })

  it('loops back to the first focusable after the last by default', () => {
    vi.useFakeTimers()
    const { root, a } = makeScene()
    const manager = makeManager(root)
    track(createSwitchScan(manager, { autoStart: true, intervalMs: 1000 }))

    vi.advanceTimersByTime(1000 * 4)
    expect(manager.focused.value).toBe(a)
  })

  it('stops advancing at the last focusable when loop is false', () => {
    vi.useFakeTimers()
    const { root, c } = makeScene()
    const manager = makeManager(root)
    const scan = track(
      createSwitchScan(manager, { autoStart: true, intervalMs: 1000, loop: false })
    )

    vi.advanceTimersByTime(1000 * 3)
    expect(manager.focused.value).toBe(c)
    expect(scan.running).toBe(true)

    // The 4th tick discovers the walk is already at the end and halts instead of wrapping.
    vi.advanceTimersByTime(1000)
    expect(manager.focused.value).toBe(c)
    expect(scan.running).toBe(false)

    vi.advanceTimersByTime(1000 * 2)
    expect(manager.focused.value).toBe(c)
  })
})

describe('switchPress', () => {
  it('activates the currently-focused component through the manager', () => {
    const { root, b } = makeScene()
    const manager = makeManager(root)
    manager.setFocus(b)
    const activate = vi.spyOn(b, 'activate')
    const scan = track(createSwitchScan(manager))

    scan.switchPress()

    expect(activate).toHaveBeenCalledTimes(1)
    expect(activate.mock.calls[0]![0]).toMatchObject({ source: 'switch' })
  })
})

describe('pause / resume', () => {
  it('pause holds the focused position and stops advancing; resume continues from there', () => {
    vi.useFakeTimers()
    const { root, a, b } = makeScene()
    const manager = makeManager(root)
    const scan = track(createSwitchScan(manager, { autoStart: true, intervalMs: 1000 }))

    vi.advanceTimersByTime(1000)
    expect(manager.focused.value).toBe(a)

    scan.pause()
    expect(scan.running).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(manager.focused.value).toBe(a)

    scan.resume()
    expect(scan.running).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(manager.focused.value).toBe(b)
  })

  it('stop resets the walk — a later start begins a fresh lap at the first focusable', () => {
    vi.useFakeTimers()
    const { root, a, b } = makeScene()
    const manager = makeManager(root)
    const scan = track(createSwitchScan(manager, { autoStart: true, intervalMs: 1000 }))

    vi.advanceTimersByTime(2000)
    expect(manager.focused.value).toBe(b)

    scan.stop()
    expect(scan.running).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(manager.focused.value).toBe(b) // no timer armed — nothing moves

    scan.start()
    vi.advanceTimersByTime(1000)
    expect(manager.focused.value).toBe(a) // fresh lap, not a continuation from b
  })
})

describe('intervalMs', () => {
  it('is honored: no advance before it elapses, advances exactly at it', () => {
    vi.useFakeTimers()
    const { root, a } = makeScene()
    const manager = makeManager(root)
    track(createSwitchScan(manager, { autoStart: true, intervalMs: 500 }))

    vi.advanceTimersByTime(499)
    expect(manager.focused.value).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(manager.focused.value).toBe(a)
  })
})

describe('bindSpaceKey', () => {
  it('a Space keydown on document fires switchPress while running, and is unbound after dispose', () => {
    const { root, a } = makeScene()
    const manager = makeManager(root)
    manager.setFocus(a)
    const activate = vi.spyOn(a, 'activate')
    const scan = track(createSwitchScan(manager, { autoStart: true, bindSpaceKey: true }))

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    expect(activate).toHaveBeenCalledTimes(1)
    expect(activate.mock.calls[0]![0]).toMatchObject({ source: 'switch' })
    expect(event.defaultPrevented).toBe(true)

    scan.dispose()
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    )
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('does not bind when bindSpaceKey is left at its default (false)', () => {
    const { root, a } = makeScene()
    const manager = makeManager(root)
    manager.setFocus(a)
    const activate = vi.spyOn(a, 'activate')
    track(createSwitchScan(manager, { autoStart: true }))

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    )
    expect(activate).not.toHaveBeenCalled()
  })
})

describe('dispose', () => {
  it('clears the timer — a later timer advance does nothing — and unbinds the key listener', () => {
    vi.useFakeTimers()
    const { root, a } = makeScene()
    const manager = makeManager(root)
    manager.setFocus(a)
    const activate = vi.spyOn(a, 'activate')
    const scan = createSwitchScan(manager, {
      autoStart: true,
      intervalMs: 1000,
      bindSpaceKey: true,
    })

    scan.dispose()
    expect(scan.running).toBe(false)

    vi.advanceTimersByTime(5000)
    expect(manager.focused.value).toBe(a) // unmoved — no timer left to advance it

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    )
    expect(activate).not.toHaveBeenCalled()
  })
})

describe('autoStart', () => {
  it('defaults to false: the controller does not start scanning on creation', () => {
    vi.useFakeTimers()
    const { root } = makeScene()
    const manager = makeManager(root)
    const scan = track(createSwitchScan(manager, { intervalMs: 1000 }))

    expect(scan.running).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(manager.focused.value).toBeUndefined()
  })
})
