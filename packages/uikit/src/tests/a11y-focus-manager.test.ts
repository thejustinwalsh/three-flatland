// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Object3D, PerspectiveCamera } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Container } from '../index.js'
import {
  A11yFocusManager,
  enableKeyboardSceneNav,
  getA11yFocusManager,
  type A11yFocusManagerOptions,
} from '../a11y/focus-manager.js'
import {
  registerAnnouncementBackend,
  setA11yPreferences,
  type Announcement,
} from '../a11y/announce/announcer.js'

/**
 * A11yFocusManager (spec §5.1) with hand-derived geometry. One 400×400 px root (pixelSize 0.01 →
 * a 4×4 world-unit panel centered at the origin) holds absolutely-positioned 100×100 px children —
 * all sharing ONE RootContext, which is what the manager enumerates. PerspectiveCamera(90, 1) at
 * (0,0,5) looking at the origin + a 100×100 px viewport projects a world point (wx, wy, 0) to
 *   sx = 50 + 10·wx,  sy = 50 − 10·wy
 * A child at (positionLeft L, positionTop T) has its center at layout (L+50, T+50), i.e. world
 *   x = (L + 50 − 200) / 100,  y = (200 − (T + 50)) / 100
 * Fixed children: A(50,150)→world(−1,0)→screen(40,50); B(150,150)→(0,0)→(50,50);
 * C(250,150)→(1,0)→(60,50); OFF(850,150)→(7,0)→screen 120 — projected rect [115,125] sits fully
 * right of the 100px viewport → classified 'offscreen', camera-relative direction "right".
 */

beforeAll(async () => {
  await loadYoga()
})

// Keep the registry non-empty for the whole file so announce() never auto-registers the DOM
// live-region backend (module-global state that would persist for the rest of the run).
let removeSentinelBackend: () => void
beforeAll(() => {
  removeSentinelBackend = registerAnnouncementBackend({ announce: () => {} })
})
afterAll(() => {
  removeSentinelBackend()
})

const disposables: Array<Container> = []
const managers: Array<A11yFocusManager> = []

afterEach(() => {
  for (const manager of managers) {
    manager.dispose()
  }
  managers.length = 0
  for (const component of disposables) {
    component.dispose()
  }
  disposables.length = 0
  setA11yPreferences({ reducedMotion: false })
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
  const child = (
    positionLeft: number,
    positionTop: number,
    props?: ConstructorParameters<typeof Container>[0]
  ): Container => {
    const component = new Container({
      width: 100,
      height: 100,
      positionType: 'absolute',
      positionLeft,
      positionTop,
      role: 'button',
      ...props,
    })
    root.add(component)
    disposables.push(component)
    root.update(16)
    return component
  }
  const a = child(50, 150, { ariaLabel: 'A' })
  const b = child(150, 150, { ariaLabel: 'B' })
  const c = child(250, 150, { ariaLabel: 'C' })
  const off = child(850, 150, { ariaLabel: 'Off' })
  return { root, a, b, c, off, child }
}

function makeManager(root: Container, options?: A11yFocusManagerOptions): A11yFocusManager {
  const manager = new A11yFocusManager(root, {
    camera: makeCamera(),
    viewport: VIEWPORT,
    ...options,
  })
  managers.push(manager)
  return manager
}

function spyAnnouncements(): { messages: Array<Announcement>; unregister: () => void } {
  const messages: Array<Announcement> = []
  const unregister = registerAnnouncementBackend({ announce: (a) => messages.push(a) })
  return { messages, unregister }
}

describe('focusables', () => {
  it('contains only interactive, enabled, policy-passing members; empty without a view', () => {
    const { root, a, b, c, off, child } = makeScene()
    const disabled = child(50, 250, { ariaLabel: 'Disabled', disabled: true })
    const content = child(150, 250, { role: 'content' })

    // Default 'announce' policy: the offscreen member stays reachable; disabled + non-interactive never.
    const announcing = makeManager(root)
    const focusables = new Set(announcing.focusables.value)
    expect(focusables).toEqual(new Set([a, b, c, off]))
    expect(focusables.has(disabled)).toBe(false)
    expect(focusables.has(content)).toBe(false)

    // 'skip' policy: offscreen members drop out of the focusable set entirely.
    const skipping = makeManager(root, { policy: { offscreen: 'skip' } })
    expect(new Set(skipping.focusables.value)).toEqual(new Set([a, b, c]))

    // No camera/viewport → the manager cannot judge perceivability → documented empty set.
    const viewless = new A11yFocusManager(root)
    managers.push(viewless)
    expect(viewless.focusables.value).toEqual([])
  })
})

describe('focusNext / focusPrev', () => {
  it('walks the spatial order left-to-right, skips policy-skipped members, and wraps', () => {
    const { root, a, b, c } = makeScene()
    const manager = makeManager(root, { policy: { offscreen: 'skip' } })

    manager.focusNext()
    expect(manager.focused.value).toBe(a)
    manager.focusNext()
    expect(manager.focused.value).toBe(b)
    expect(a.hasFocus.value).toBe(false)
    expect(b.hasFocus.value).toBe(true)
    manager.focusNext()
    expect(manager.focused.value).toBe(c)
    // OFF is policy-skipped, so the walk wraps straight back to A — never a dead end.
    manager.focusNext()
    expect(manager.focused.value).toBe(a)
  })

  it('reaches the offscreen member under the default announce policy, then wraps', () => {
    const { root, a, off } = makeScene()
    const manager = makeManager(root)
    const { messages, unregister } = spyAnnouncements()
    try {
      manager.focusNext() // a
      manager.focusNext() // b
      manager.focusNext() // c
      manager.focusNext()
      expect(manager.focused.value).toBe(off)
      expect(messages).toHaveLength(1)
      manager.focusNext()
      expect(manager.focused.value).toBe(a)
    } finally {
      unregister()
    }
  })

  it('focusPrev starts at the last entry and wraps backwards past the start', () => {
    const { root, a, b, c } = makeScene()
    const manager = makeManager(root, { policy: { offscreen: 'skip' } })

    manager.focusPrev()
    expect(manager.focused.value).toBe(c)
    manager.focusPrev()
    expect(manager.focused.value).toBe(b)
    manager.focusPrev()
    expect(manager.focused.value).toBe(a)
    manager.focusPrev()
    expect(manager.focused.value).toBe(c)
  })
})

describe('setFocus — DOM mirror and echo-loop safety', () => {
  it('lands hasFocus, mirrors into element.focus() exactly once, and survives echoed focus events', () => {
    const { root, a, b } = makeScene()
    const manager = makeManager(root)
    const elA = a.a11yElement!
    const focusSpyA = vi.spyOn(elA, 'focus')
    const setFocusSpy = vi.spyOn(manager, 'setFocus')

    manager.setFocus(a)
    expect(a.hasFocus.value).toBe(true)
    expect(manager.focused.value).toBe(a)
    expect(document.activeElement).toBe(elA)
    expect(focusSpyA).toHaveBeenCalledTimes(1)
    expect(setFocusSpy).toHaveBeenCalledTimes(1)

    // Adversarial echo: re-fire the exact DOM events the mirror produces. Neither the focus
    // listener (setupUpdateHasFocus) nor the manager's focusin adoption may re-enter setFocus or
    // call element.focus() again — a ping-pong here would recurse forever.
    elA.dispatchEvent(new FocusEvent('focus'))
    elA.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(focusSpyA).toHaveBeenCalledTimes(1)
    expect(setFocusSpy).toHaveBeenCalledTimes(1)
    expect(a.hasFocus.value).toBe(true)
    expect(manager.focused.value).toBe(a)

    // Moving on clears the previous target — signal AND DOM agree.
    manager.setFocus(b)
    expect(b.hasFocus.value).toBe(true)
    expect(a.hasFocus.value).toBe(false)
    expect(document.activeElement).toBe(b.a11yElement)
    expect(focusSpyA).toHaveBeenCalledTimes(1)
  })

  it('setFocus(undefined) clears focus and releases DOM focus — no component left stuck', () => {
    const { root, a } = makeScene()
    const manager = makeManager(root)
    manager.setFocus(a)
    manager.setFocus(undefined)
    expect(a.hasFocus.value).toBe(false)
    expect(manager.focused.value).toBeUndefined()
    expect(document.activeElement).not.toBe(a.a11yElement)
  })

  it('adopts native DOM focus (Tab/AT) without reflecting back into element.focus()', () => {
    const { root, a, b } = makeScene()
    const manager = makeManager(root)
    manager.setFocus(a)

    const elB = b.a11yElement!
    const focusSpyB = vi.spyOn(elB, 'focus')
    const setFocusSpy = vi.spyOn(manager, 'setFocus')
    elB.focus() // the platform moves focus, not the manager

    expect(manager.focused.value).toBe(b)
    expect(b.hasFocus.value).toBe(true)
    expect(a.hasFocus.value).toBe(false)
    // Adoption is signals-only: setFocus was never re-entered, elB.focus() ran exactly the one
    // time the platform (this test) called it.
    expect(setFocusSpy).not.toHaveBeenCalled()
    expect(focusSpyB).toHaveBeenCalledTimes(1)
  })

  it('skips the DOM mirror inside an XR session', () => {
    const { root, a } = makeScene()
    const manager = makeManager(root, { isXRSession: () => true })
    const focusSpy = vi.spyOn(a.a11yElement!, 'focus')
    manager.setFocus(a)
    expect(a.hasFocus.value).toBe(true)
    expect(manager.focused.value).toBe(a)
    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('refuses to land on a disabled component — focus stays where it was', () => {
    const { root, a, child } = makeScene()
    const disabled = child(50, 250, { ariaLabel: 'Disabled', disabled: true })
    const manager = makeManager(root)
    manager.setFocus(a)
    manager.setFocus(disabled)
    expect(manager.focused.value).toBe(a)
    expect(disabled.hasFocus.value).toBe(false)
  })

  it('fires onFocusChange(true) on the new focus and (false) on the old, each once (codex P3 #1)', () => {
    // A generic role:'button' container has no standing hasFocus→onFocusChange effect (only Input
    // does), so the manager's explicit callback is the ONLY source — programmatic focus must still
    // notify listeners exactly as a real DOM focus would.
    const { root, child } = makeScene()
    const gained: Array<boolean> = []
    const lost: Array<boolean> = []
    const first = child(50, 150, { ariaLabel: 'First', onFocusChange: (v) => gained.push(v) })
    const second = child(150, 150, { ariaLabel: 'Second', onFocusChange: (v) => lost.push(v) })
    const manager = makeManager(root)

    manager.setFocus(first)
    expect(gained).toEqual([true])

    manager.setFocus(second)
    expect(gained).toEqual([true, false]) // first was notified it lost focus
    expect(lost).toEqual([true]) // second gained it — no duplicate fire from the DOM mirror echo
  })
})

describe('reveal policy', () => {
  it("announce (default): offscreen focus lands and announces a direction word ('right')", () => {
    const { root, off } = makeScene()
    const manager = makeManager(root)
    const { messages, unregister } = spyAnnouncements()
    try {
      manager.setFocus(off)
      expect(manager.focused.value).toBe(off)
      expect(off.hasFocus.value).toBe(true)
      expect(messages).toHaveLength(1)
      expect(messages[0]!.kind).toBe('focus')
      expect(messages[0]!.source).toBe(off)
      // OFF sits at world x=+7 (camera at the origin axis looking −z) → dominant axis says right.
      expect(messages[0]!.message).toContain('right')
    } finally {
      unregister()
    }
  })

  it('announce: an offscreen-left target says left; a11yPositionDescription overrides the phrase', () => {
    const { root, child } = makeScene()
    const left = child(-650, 150, { ariaLabel: 'Portal' }) // world x = −8 → offscreen left
    const described = child(850, 250, {
      ariaLabel: 'Hatch',
      a11yPositionDescription: 'on the ceiling, behind you',
    })
    const manager = makeManager(root)
    const { messages, unregister } = spyAnnouncements()
    try {
      manager.setFocus(left)
      expect(messages[0]!.message).toContain('left')
      manager.setFocus(described)
      expect(messages[1]!.message).toBe('on the ceiling, behind you')
    } finally {
      unregister()
    }
  })

  it('skip: setFocus refuses an offscreen target — previous focus is kept, nothing announced', () => {
    const { root, a, off } = makeScene()
    const manager = makeManager(root, { policy: { offscreen: 'skip' } })
    const { messages, unregister } = spyAnnouncements()
    try {
      manager.setFocus(a)
      manager.setFocus(off)
      expect(manager.focused.value).toBe(a)
      expect(off.hasFocus.value).toBe(false)
      expect(a.hasFocus.value).toBe(true)
      expect(document.activeElement).toBe(a.a11yElement)
      expect(messages).toHaveLength(0)
    } finally {
      unregister()
    }
  })

  it('reveal: onReveal fires exactly once per focus landing and the camera is never moved', () => {
    const { root, off } = makeScene()
    const camera = makeCamera()
    const onReveal = vi.fn()
    const manager = new A11yFocusManager(root, {
      camera,
      viewport: VIEWPORT,
      policy: { offscreen: 'reveal', onReveal },
    })
    managers.push(manager)
    const positionBefore = camera.position.clone()
    const quaternionBefore = camera.quaternion.clone()
    const { messages, unregister } = spyAnnouncements()
    try {
      manager.setFocus(off)
      expect(manager.focused.value).toBe(off)
      expect(onReveal).toHaveBeenCalledTimes(1)
      expect(onReveal).toHaveBeenCalledWith(off)
      // Re-focusing the already-focused component must NOT re-reveal.
      manager.setFocus(off)
      expect(onReveal).toHaveBeenCalledTimes(1)
      // XAUR motion-agnostic: revealing is app-owned — the manager never touches the camera.
      expect(camera.position.equals(positionBefore)).toBe(true)
      expect(camera.quaternion.equals(quaternionBefore)).toBe(true)
      // The reveal replaces the position announcement (the app is bringing it into view).
      expect(messages).toHaveLength(0)
    } finally {
      unregister()
    }
  })

  it('opts.reveal forces the reveal path under the announce policy', () => {
    const { root, off } = makeScene()
    const onReveal = vi.fn()
    const manager = makeManager(root, { policy: { onReveal } }) // offscreen stays 'announce'
    const { messages, unregister } = spyAnnouncements()
    try {
      manager.setFocus(off, { reveal: true })
      expect(manager.focused.value).toBe(off)
      expect(onReveal).toHaveBeenCalledTimes(1)
      expect(messages).toHaveLength(0)
    } finally {
      unregister()
    }
  })

  it('reducedMotion forces announce — onReveal is never called', () => {
    const { root, off } = makeScene()
    setA11yPreferences({ reducedMotion: true })
    const onReveal = vi.fn()
    const manager = makeManager(root, { policy: { offscreen: 'reveal', onReveal } })
    const { messages, unregister } = spyAnnouncements()
    try {
      manager.setFocus(off)
      expect(manager.focused.value).toBe(off)
      expect(onReveal).not.toHaveBeenCalled()
      expect(messages).toHaveLength(1)
      expect(messages[0]!.message).toContain('right')
    } finally {
      unregister()
    }
  })
})

describe('focusDirectional', () => {
  it("picks the manager's nearest neighbor in the requested half-plane", () => {
    const { root, a, b, child } = makeScene()
    const up = child(150, 50, { ariaLabel: 'Up' }) // world (0,1) → screen (50,40)
    const manager = makeManager(root, { policy: { offscreen: 'skip' } })

    manager.setFocus(b)
    manager.focusDirectional('left')
    expect(manager.focused.value).toBe(a)
    // From A (40,50): B at (50,50) is 10px away — nearer than C at 20px.
    manager.focusDirectional('right')
    expect(manager.focused.value).toBe(b)
    manager.focusDirectional('up')
    expect(manager.focused.value).toBe(up)
    // From UP (50,40): B (dy 10) beats A/C (√(10²+10²) ≈ 14.1).
    manager.focusDirectional('down')
    expect(manager.focused.value).toBe(b)
    // Nothing below the A/B/C row → focus stays put instead of trapping or clearing.
    manager.focusDirectional('down')
    expect(manager.focused.value).toBe(b)
  })
})

describe('activateFocused', () => {
  it("routes through the semantic activation path, defaulting to source 'keyboard'", () => {
    const { root, a } = makeScene()
    const manager = makeManager(root)
    manager.setFocus(a)
    const activate = vi.spyOn(a, 'activate')
    manager.activateFocused()
    expect(activate).toHaveBeenCalledTimes(1)
    expect(activate.mock.calls[0]![0]).toMatchObject({ source: 'keyboard' })
    manager.activateFocused({ source: 'gaze' })
    expect(activate.mock.calls[1]![0]).toMatchObject({ source: 'gaze' })
  })
})

describe('getA11yFocusManager — per-root singleton', () => {
  it('returns one instance per root; dispose clears focus (no trap) and a re-get is fresh', () => {
    const { root, a } = makeScene()
    const first = getA11yFocusManager(root, { camera: makeCamera(), viewport: VIEWPORT })
    managers.push(first)
    expect(getA11yFocusManager(root)).toBe(first)

    first.setFocus(a)
    expect(a.hasFocus.value).toBe(true)
    first.dispose()
    // dispose must not leave a component stuck focused — DOM-only behavior is restored.
    expect(a.hasFocus.value).toBe(false)
    expect(first.focused.value).toBeUndefined()
    expect(document.activeElement).not.toBe(a.a11yElement)

    const fresh = getA11yFocusManager(root, { camera: makeCamera(), viewport: VIEWPORT })
    managers.push(fresh)
    expect(fresh).not.toBe(first)
    fresh.focusNext()
    expect(fresh.focused.value).toBe(a)
  })
})

describe('enableKeyboardSceneNav', () => {
  it('drives directional/Home/End from key events on member elements and unbinds cleanly', () => {
    const { root, a, b, c } = makeScene()
    const manager = getA11yFocusManager(root, {
      camera: makeCamera(),
      viewport: VIEWPORT,
      policy: { offscreen: 'skip' },
    })
    managers.push(manager)
    const unbind = enableKeyboardSceneNav(root)
    try {
      manager.setFocus(b)
      b.a11yElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      )
      expect(manager.focused.value).toBe(c)
      c.a11yElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })
      )
      expect(manager.focused.value).toBe(a)
      a.a11yElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })
      )
      expect(manager.focused.value).toBe(c) // skip policy → last focusable is C, not OFF
      unbind()
      c.a11yElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
      )
      expect(manager.focused.value).toBe(c)
    } finally {
      unbind()
    }
  })
})
